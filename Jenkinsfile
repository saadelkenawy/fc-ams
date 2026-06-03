pipeline {
    agent any

    options {
        disableConcurrentBuilds()
    }

    environment {
        DOCKERHUB_USER  = 'saadelkenawy'
        DOCKERHUB_CRED  = 'dockerhub-creds'         // Jenkins credential ID
        PREPROD_HOST    = 'preprod.fadlclinic.local'
        PROD_HOST       = 'prod.fadlclinic.local'

        // ── Feature branch / K8s testing ─────────────────────────────────────
        FEATURE_BRANCH  = '001-modular-architecture-feature-flags'
        K8S_NAMESPACE   = 'fadl-testing'
        K8S_CRED        = 'k8s-testing-kubeconfig'  // Jenkins secret-file credential
    }

    stages {

        // ── 1. Detect which services changed since the last successful build ──
        stage('Detect Changes') {
            steps {
                script {
                    def base = env.GIT_PREVIOUS_SUCCESSFUL_COMMIT ?: 'HEAD~1'
                    def changed = sh(
                        script: "git diff --name-only ${base} HEAD",
                        returnStdout: true
                    ).trim().split('\n').toList()

                    echo "Changed files:\n${changed.join('\n')}"

                    // Map: path prefix → [service-name, build-context]
                    def serviceMap = [
                        'frontend/web-portal'          : [name: 'fcms-web-portal',          ctx: 'frontend/web-portal'],
                        'services/ai-chatbot-service'  : [name: 'fcms-ai-chatbot-service',   ctx: 'services/ai-chatbot-service'],
                        'services/analytics-service'   : [name: 'fcms-analytics-service',    ctx: 'services/analytics-service'],
                        'services/appointment-service' : [name: 'fcms-appointment-service',  ctx: 'services/appointment-service'],
                        'services/billing-service'     : [name: 'fcms-billing-service',      ctx: 'services/billing-service'],
                        'services/doctor-service'      : [name: 'fcms-doctor-service',       ctx: 'services/doctor-service'],
                        'services/ehr-service'         : [name: 'fcms-ehr-service',          ctx: 'services/ehr-service'],
                        'services/file-service'        : [name: 'fcms-file-service',         ctx: 'services/file-service'],
                        'services/identity-service'    : [name: 'fcms-identity-service',     ctx: 'services/identity-service'],
                        'services/integration-service' : [name: 'fcms-integration-service',  ctx: 'services/integration-service'],
                        'services/notification-service': [name: 'fcms-notification-service', ctx: 'services/notification-service'],
                        'services/patient-service'     : [name: 'fcms-patient-service',      ctx: 'services/patient-service'],
                        'services/procedure-service'   : [name: 'fcms-procedure-service',    ctx: 'services/procedure-service'],
                        'services/procurement-service' : [name: 'fcms-procurement-service',  ctx: 'services/procurement-service'],
                        'services/telehealth-service'  : [name: 'fcms-telehealth-service',   ctx: 'services/telehealth-service'],
                    ]

                    def allServices = serviceMap.values().toList()
                    def toBuild = [] as LinkedHashSet

                    // Track whether any k8s manifest changed (triggers cluster apply)
                    def k8sChanged = changed.any { it.startsWith('k8s/') }
                    env.DEPLOY_K8S = k8sChanged ? 'true' : 'false'

                    changed.each { file ->
                        // shared/ or root config change → rebuild everything
                        if (file.startsWith('shared/') || file == 'pnpm-workspace.yaml' || file == 'tsconfig.base.json') {
                            toBuild.addAll(allServices)
                            return
                        }
                        serviceMap.each { prefix, svc ->
                            if (file.startsWith(prefix)) {
                                toBuild.add(svc)
                            }
                        }
                    }

                    def onFeatureBranch = env.BRANCH_NAME == env.FEATURE_BRANCH
                    def hasWork = !toBuild.isEmpty() || (onFeatureBranch && k8sChanged)

                    if (!hasWork) {
                        echo "No service-related changes detected — skipping build."
                        currentBuild.result = 'NOT_BUILT'
                        return
                    }

                    env.BUILD_TAG  = env.GIT_COMMIT.take(8)
                    env.BUILD_LIST = toBuild.collect { "${it.name}|${it.ctx}" }.join(';')
                    echo "Will build: ${toBuild.isEmpty() ? '(none)' : toBuild.collect { it.name }.join(', ')}"
                    echo "K8s manifests changed: ${k8sChanged}"
                }
            }
        }

        // ── 2. Run tests + generate lcov coverage reports ────────────────────
        stage('Test & Coverage') {
            when { expression { env.BUILD_LIST?.trim() } }
            steps {
                script {
                    // Map build-context path → pnpm workspace package name and run
                    // test:coverage only for changed services to keep CI fast.
                    env.BUILD_LIST.split(';').each { entry ->
                        def ctx = entry.split('\\|')[1]
                        // "services/identity-service" → "@fadl/identity-service"
                        // "frontend/web-portal"       → "@fadl/web-portal"
                        def pkg = ctx.replaceFirst('^services/', '@fadl/').replaceFirst('^frontend/', '@fadl/')
                        sh "pnpm --filter '${pkg}' run test:coverage"
                    }
                }
            }
        }

        // ── 3. SonarQube static analysis ─────────────────────────────────────
        stage('SonarQube Analysis') {
            when { expression { env.BUILD_LIST?.trim() } }
            steps {
                withSonarQubeEnv('SonarQube-FCMS') {
                    // sonar-project.properties at repo root drives the multi-module scan.
                    // SONAR_HOST_URL and SONAR_AUTH_TOKEN are injected by the plugin —
                    // they are never hardcoded here.
                    sh "sonar-scanner -Dsonar.projectVersion=${env.BUILD_TAG}"
                }
            }
        }

        // ── 4. Quality gate — blocks Build Images on failure ──────────────────
        stage('Quality Gate') {
            when { expression { env.BUILD_LIST?.trim() } }
            steps {
                // 5-minute timeout prevents a hung webhook from blocking the runner.
                // abortPipeline: true → gate FAILURE stops the pipeline here so
                // broken code never reaches Docker Hub or the K8s cluster.
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        // ── 5. Build each changed service image ──────────────────────────────
        stage('Build Images') {
            when { expression { env.BUILD_LIST?.trim() } }
            steps {
                script {
                    env.BUILD_LIST.split(';').each { entry ->
                        def (imageName, buildCtx) = entry.split('\\|')
                        def fullImage = "${env.DOCKERHUB_USER}/${imageName}"

                        // Build from repo root so all services can resolve shared/types
                        // via pnpm workspace:* — Dockerfile path is specified explicitly
                        echo "Building ${fullImage} (context=., dockerfile=${buildCtx}/Dockerfile)"
                        sh "docker build -f ${buildCtx}/Dockerfile -t ${fullImage}:${env.BUILD_TAG} -t ${fullImage}:latest ."
                    }
                }
            }
        }

        // ── 3. Push to Docker Hub ────────────────────────────────────────────
        stage('Push to Docker Hub') {
            when { expression { env.BUILD_LIST?.trim() } }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: env.DOCKERHUB_CRED,
                    usernameVariable: 'DH_USER',
                    passwordVariable: 'DH_PASS'
                )]) {
                    sh 'echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin'

                    script {
                        env.BUILD_LIST.split(';').each { entry ->
                            def (imageName, buildCtx) = entry.split('\\|')
                            def fullImage = "${env.DOCKERHUB_USER}/${imageName}"

                            sh "docker push ${fullImage}:${env.BUILD_TAG}"
                            sh "docker push ${fullImage}:latest"
                            echo "Pushed: ${fullImage}:${env.BUILD_TAG}"
                        }
                    }

                    sh 'docker logout'
                }
            }
        }

        // ── 4. Deploy → K8s Testing (feature branch only) ────────────────────
        //    Applies the full k8s/testing/ manifest set and pins each rebuilt
        //    service to the exact image tag produced in this build.
        stage('Deploy → K8s Testing') {
            when {
                allOf {
                    expression { env.BRANCH_NAME == env.FEATURE_BRANCH }
                    expression { env.BUILD_LIST?.trim() || env.DEPLOY_K8S == 'true' }
                }
            }
            steps {
                withCredentials([file(credentialsId: env.K8S_CRED, variable: 'KUBECONFIG')]) {
                    script {
                        // Apply infrastructure first (namespace, configmap, redis)
                        sh """
                            kubectl apply -f k8s/testing/namespace.yaml
                            kubectl apply -f k8s/testing/configmap-feature-flags.yaml
                            kubectl apply -f k8s/testing/redis.yaml -n ${env.K8S_NAMESPACE}
                        """

                        // Apply service deployments + HPAs
                        sh """
                            kubectl apply -f k8s/testing/identity-service.yaml    -n ${env.K8S_NAMESPACE}
                            kubectl apply -f k8s/testing/patient-service.yaml     -n ${env.K8S_NAMESPACE}
                            kubectl apply -f k8s/testing/doctor-service.yaml      -n ${env.K8S_NAMESPACE}
                            kubectl apply -f k8s/testing/appointment-service.yaml -n ${env.K8S_NAMESPACE}
                            kubectl apply -f k8s/testing/billing-service.yaml     -n ${env.K8S_NAMESPACE}
                            kubectl apply -f k8s/testing/ehr-service.yaml         -n ${env.K8S_NAMESPACE}
                            kubectl apply -f k8s/testing/ai-chatbot-service.yaml  -n ${env.K8S_NAMESPACE}
                            kubectl apply -f k8s/testing/analytics-service.yaml   -n ${env.K8S_NAMESPACE}
                            kubectl apply -f k8s/testing/web-portal.yaml          -n ${env.K8S_NAMESPACE}
                        """

                        // Apply ingress last (depends on services existing)
                        sh "kubectl apply -f k8s/testing/ingress.yaml -n ${env.K8S_NAMESPACE}"

                        // Pin each rebuilt service to the exact build-tag image so
                        // the cluster reflects this commit's build precisely.
                        if (env.BUILD_LIST?.trim()) {
                            // Map: fcms image name → k8s deployment/container name
                            def imageToDeployment = [
                                'fcms-identity-service'   : 'identity-service',
                                'fcms-appointment-service': 'appointment-service',
                                'fcms-patient-service'    : 'patient-service',
                                'fcms-doctor-service'     : 'doctor-service',
                                'fcms-billing-service'    : 'billing-service',
                                'fcms-ehr-service'        : 'ehr-service',
                                'fcms-ai-chatbot-service' : 'ai-chatbot-service',
                                'fcms-analytics-service'  : 'analytics-service',
                                'fcms-web-portal'         : 'web-portal',
                            ]

                            env.BUILD_LIST.split(';').each { entry ->
                                def imageName = entry.split('\\|')[0]
                                def deployment = imageToDeployment[imageName]
                                if (deployment) {
                                    def fullImage = "${env.DOCKERHUB_USER}/${imageName}:${env.BUILD_TAG}"
                                    sh """
                                        kubectl set image deployment/${deployment} \
                                            ${deployment}=${fullImage} \
                                            -n ${env.K8S_NAMESPACE}
                                    """
                                    echo "Pinned ${deployment} → ${fullImage}"
                                }
                            }
                        }

                        // Wait for all deployments to finish rolling out
                        sh """
                            kubectl rollout status deployment/identity-service    -n ${env.K8S_NAMESPACE} --timeout=120s
                            kubectl rollout status deployment/appointment-service -n ${env.K8S_NAMESPACE} --timeout=120s
                            kubectl rollout status deployment/patient-service     -n ${env.K8S_NAMESPACE} --timeout=120s
                            kubectl rollout status deployment/doctor-service      -n ${env.K8S_NAMESPACE} --timeout=120s
                            kubectl rollout status deployment/billing-service     -n ${env.K8S_NAMESPACE} --timeout=120s
                            kubectl rollout status deployment/ehr-service         -n ${env.K8S_NAMESPACE} --timeout=120s
                            kubectl rollout status deployment/ai-chatbot-service  -n ${env.K8S_NAMESPACE} --timeout=120s
                            kubectl rollout status deployment/analytics-service   -n ${env.K8S_NAMESPACE} --timeout=120s
                            kubectl rollout status deployment/web-portal          -n ${env.K8S_NAMESPACE} --timeout=180s
                        """

                        echo "K8s testing cluster updated — http://fadl-testing.local"
                    }
                }
            }
        }

        // ── 5. Deploy → Pre-Production ───────────────────────────────────────
        stage('Deploy → Pre-Prod') {
            when {
                allOf {
                    expression { env.BUILD_LIST?.trim() }
                    branch 'pre-prod'
                }
            }
            steps {
                sshagent(['deploy-server-key']) {
                    script {
                        def services = env.BUILD_LIST.split(';').collect { it.split('\\|')[0] }.join(' ')
                        sh """
                            ssh deploy@\${PREPROD_HOST} '
                                cd /opt/fcms &&
                                docker compose -f docker-compose.yml -f docker-compose.prod.yml pull ${services} &&
                                docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps ${services} &&
                                docker image prune -f
                            '
                        """
                    }
                }
            }
        }

        // ── 6. Deploy → Production ───────────────────────────────────────────
        stage('Deploy → Production') {
            when {
                allOf {
                    expression { env.BUILD_LIST?.trim() }
                    branch 'main'
                }
            }
            steps {
                catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                    sshagent(['deploy-server-key']) {
                        script {
                            def services = env.BUILD_LIST.split(';').collect { it.split('\\|')[0] }.join(' ')
                            sh """
                                ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no deploy@\${PROD_HOST} '
                                    cd /opt/fcms &&
                                    docker compose -f docker-compose.yml -f docker-compose.prod.yml pull ${services} &&
                                    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps ${services} &&
                                    docker image prune -f
                                '
                            """
                        }
                    }
                }
            }
        }

        // ── 7. Clean up Jenkins build server ─────────────────────────────────
        stage('Cleanup') {
            when { expression { env.BUILD_LIST?.trim() } }
            steps {
                script {
                    env.BUILD_LIST.split(';').each { entry ->
                        def (imageName, buildCtx) = entry.split('\\|')
                        def fullImage = "${env.DOCKERHUB_USER}/${imageName}"
                        sh "docker rmi ${fullImage}:${env.BUILD_TAG} ${fullImage}:latest || true"
                    }
                }
                // Remove dangling intermediate layers left over from the build
                sh 'docker image prune -f'
                // Prune build cache — keep 5 GB of warm layers for faster incremental builds
                sh 'docker builder prune -f --keep-storage=5GB'
            }
        }
    }

    post {
        success {
            echo "All images pushed to https://hub.docker.com/u/${env.DOCKERHUB_USER}"
            script {
                if (env.BUILD_LIST?.trim()) {
                    // Trigger local dev deploy on every successful build
                    def deployServices = env.BUILD_LIST.split(';').collect { entry ->
                        entry.split('\\|')[0].replaceFirst('^fcms-', '')
                    }.join(',')

                    echo "Triggering fcms-deploy → local with tag=latest, services=${deployServices}"
                    build job: 'fcms-deploy',
                          wait: false,
                          parameters: [
                              string(name: 'IMAGE_TAG',     value: 'latest'),
                              string(name: 'DEPLOY_TARGET', value: 'local'),
                              string(name: 'SERVICES',      value: deployServices)
                          ]
                }

                if (env.BRANCH_NAME == env.FEATURE_BRANCH) {
                    echo "Feature branch demo available at: http://fadl-testing.local"
                }
            }
        }
        failure {
            echo "Pipeline failed — check stage logs above."
        }
        always {
            sh 'docker logout || true'
        }
    }
}
