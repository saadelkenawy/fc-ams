pipeline {
    agent any

    options {
        disableConcurrentBuilds()
    }

    environment {
        DOCKERHUB_USER  = 'saadelkenawy'
        DOCKERHUB_CRED  = 'dockerhub-creds'   // Jenkins credential ID
        PREPROD_HOST    = 'preprod.fadlclinic.local'
        PROD_HOST       = 'prod.fadlclinic.local'
        SONAR_HOST      = 'http://fcms-sonarqube:9000'   // internal Docker network
        SONAR_PROJECT   = 'fcms'
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

                    if (toBuild.isEmpty()) {
                        echo "No service-related changes detected — skipping build."
                        currentBuild.result = 'NOT_BUILT'
                        return
                    }

                    env.BUILD_TAG = env.GIT_COMMIT.take(8)
                    env.BUILD_LIST = toBuild.collect { "${it.name}|${it.ctx}" }.join(';')
                    echo "Will build: ${toBuild.collect { it.name }.join(', ')}"
                }
            }
        }

        // ── 2. SonarQube quality gate ────────────────────────────────────────
        // Advisory gate: a Sonar outage or scanner crash marks the build
        // UNSTABLE but must never block image build + Docker Hub push
        // (Tests below is the hard gate).
        stage('SonarQube Analysis') {
            when { expression { env.BUILD_LIST?.trim() } }
            steps {
                catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                withCredentials([string(credentialsId: 'sonarqube-token', variable: 'SONAR_TOKEN')]) {
                    script {
                        // --volumes-from shares the Jenkins workspace into the scanner container
                        // without the DinD bind-mount path mismatch.
                        sh """
                            docker run --rm \
                              --volumes-from fcms-jenkins \
                              --network fcms_fadl-net \
                              -w "\${WORKSPACE}" \
                              sonarsource/sonar-scanner-cli:4.8 \
                              -Dsonar.host.url=\${SONAR_HOST} \
                              -Dsonar.login="\${SONAR_TOKEN}" \
                              -Dsonar.projectKey=\${SONAR_PROJECT}
                        """

                        // Read CE task ID written by scanner into .scannerwork/
                        def taskId = sh(
                            script: "grep '^ceTaskId=' \${WORKSPACE}/.scannerwork/report-task.txt | cut -d= -f2",
                            returnStdout: true
                        ).trim()
                        echo "SonarQube CE task: ${taskId}"

                        // Poll until analysis is processed, then assert quality gate.
                        // Runs on fcms_fadl-net so it can reach fcms-sonarqube:9000.
                        // Token + taskId are injected via env vars to avoid shell-escaping issues.
                        def qgPassed = sh(
                            returnStatus: true,
                            script: """
docker run --rm \
  --network fcms_fadl-net \
  -e SONAR_TOKEN="\${SONAR_TOKEN}" \
  -e TASK_ID="${taskId}" \
  -e SONAR_HOST="\${SONAR_HOST}" \
  -e SONAR_PROJECT="\${SONAR_PROJECT}" \
  python:3-alpine python3 -c "
import os, urllib.request, base64, json, time, sys
token   = os.environ['SONAR_TOKEN']
task_id = os.environ['TASK_ID']
base    = os.environ['SONAR_HOST']
project = os.environ['SONAR_PROJECT']

def api(path):
    req = urllib.request.Request(base + path)
    req.add_header('Authorization', 'Basic ' + base64.b64encode((token + ':').encode()).decode())
    return json.loads(urllib.request.urlopen(req).read())

for _ in range(30):
    s = api('/api/ce/task?id=' + task_id)['task']['status']
    print('CE task:', s, flush=True)
    if s in ('SUCCESS', 'FAILED', 'CANCELLED'):
        break
    time.sleep(10)

qg = api('/api/qualitygates/project_status?projectKey=' + project)['projectStatus']['status']
print('Quality Gate:', qg, flush=True)
sys.exit(0 if qg == 'OK' else 1)
"
                            """
                        )

                        if (qgPassed != 0) {
                            unstable("SonarQube Quality Gate FAILED — see http://localhost:9100/dashboard?id=${env.SONAR_PROJECT}")
                        }
                    }
                }
                }
            }
        }

        // ── 3. Money-path + RLS test suites (hard gate — fails the build) ───
        stage('Tests') {
            steps {
                script {
                    // Image build is retried: base-image pulls can hit transient
                    // registry timeouts. The test run itself is never retried.
                    retry(3) {
                        sh 'docker build -f Dockerfile.test -t fcms-tests:ci .'
                    }
                    sh '''
                        docker run --rm --network fcms_fadl-net \
                          -e TEST_PG_ADMIN_BASE=postgresql://fadl:fadl_dev_secret@postgres:5432 \
                          -e TEST_PG_APP_BASE=postgresql://fadl_app:fadl_app_dev_secret@postgres:5432 \
                          fcms-tests:ci
                    '''
                }
            }
        }

        // ── 4. Build each changed service image ──────────────────────────────
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
                        retry(3) {
                            sh "docker build -f ${buildCtx}/Dockerfile -t ${fullImage}:${env.BUILD_TAG} -t ${fullImage}:latest ."
                        }
                    }
                }
            }
        }

        // ── 4. Push to Docker Hub ────────────────────────────────────────────
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

                            retry(3) {
                                sh "docker push ${fullImage}:${env.BUILD_TAG}"
                                sh "docker push ${fullImage}:latest"
                            }
                            echo "Pushed: ${fullImage}:${env.BUILD_TAG}"
                        }
                    }

                    sh 'docker logout'
                }
            }
        }

        // ── 5. Deploy to Pre-Production ──────────────────────────────────────
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

        // ── 6. Deploy to Production ───────────────────────────────────────────
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

        // ── 7. Clean up Jenkins build server — remove built images + dangling layers ──
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
                    // Strip "fcms-" prefix from image names to match fcms-deploy's SERVICES format
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
