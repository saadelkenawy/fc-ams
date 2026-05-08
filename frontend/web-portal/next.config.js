const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  experimental: {
    serverActions: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'fadl-clinic.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async rewrites() {
    // Server-side vars (no NEXT_PUBLIC) — resolved inside the container on the Docker network
    // Defaults use Docker-internal service names (resolved by Next.js server inside the container)
    const identity     = process.env.IDENTITY_SERVICE_URL     ?? 'http://identity-service:3000/api/v1';
    const patient      = process.env.PATIENT_SERVICE_URL      ?? 'http://patient-service:3002/api/v1';
    const appointment  = process.env.APPOINTMENT_SERVICE_URL  ?? 'http://appointment-service:3001/api/v1';
    const doctor       = process.env.DOCTOR_SERVICE_URL       ?? 'http://doctor-service:3003/api/v1';
    const billing      = process.env.BILLING_SERVICE_URL      ?? 'http://billing-service:3004/api/v1';
    const ehr          = process.env.EHR_SERVICE_URL          ?? 'http://ehr-service:3005/api/v1';
    const procedure    = process.env.PROCEDURE_SERVICE_URL    ?? 'http://procedure-service:3006/api/v1';
    const notification = process.env.NOTIFICATION_SERVICE_URL ?? 'http://notification-service:3007/api/v1';
    const chatbot      = process.env.CHATBOT_SERVICE_URL      ?? 'http://ai-chatbot-service:3008/api/v1';
    const analytics    = process.env.ANALYTICS_SERVICE_URL    ?? 'http://analytics-service:3009/api/v1';
    const file         = process.env.FILE_SERVICE_URL         ?? 'http://file-service:3011/api/v1';
    const integration  = process.env.INTEGRATION_SERVICE_URL  ?? 'http://integration-service:3012/api/v1';

    // beforeFiles: run BEFORE any filesystem/API-route check so /api/proxy/* is always forwarded
    return {
      beforeFiles: [
        { source: '/api/proxy/identity/:path*',      destination: `${identity}/:path*` },
        { source: '/api/proxy/patients/:path*',      destination: `${patient}/:path*` },
        { source: '/api/proxy/appointments/:path*',  destination: `${appointment}/:path*` },
        { source: '/api/proxy/doctors/:path*',       destination: `${doctor}/:path*` },
        { source: '/api/proxy/billing/:path*',       destination: `${billing}/:path*` },
        { source: '/api/proxy/ehr/:path*',           destination: `${ehr}/:path*` },
        { source: '/api/proxy/procedures/:path*',    destination: `${procedure}/:path*` },
        { source: '/api/proxy/notifications/:path*', destination: `${notification}/:path*` },
        { source: '/api/proxy/chatbot/:path*',       destination: `${chatbot}/:path*` },
        { source: '/api/proxy/analytics/:path*',     destination: `${analytics}/:path*` },
        { source: '/api/proxy/files/:path*',         destination: `${file}/:path*` },
        { source: '/api/proxy/integration/:path*',   destination: `${integration}/:path*` },
      ],
    };
  },
};

module.exports = nextConfig;
