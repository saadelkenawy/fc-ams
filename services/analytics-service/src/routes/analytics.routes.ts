import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import * as ctrl from '../controllers/analytics.controller';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);
  app.get('/analytics/overview',      ctrl.getOverview);
  app.get('/analytics/revenue',       ctrl.getMonthlyRevenue);
  app.get('/analytics/sources',       ctrl.getSourceBreakdown);
  app.get('/analytics/doctors/top',   ctrl.getTopDoctors);
  app.get('/analytics/specialties',   ctrl.getSpecialtyBreakdown);
  app.get('/analytics/noshow-by-day',             ctrl.getNoShowByDay);
  app.get('/analytics/appointment-activity',      ctrl.getAppointmentActivitySummary);
  app.get('/analytics/financial-summary',    ctrl.getFinancialSummaryData);
  app.get('/reports/settlement',             ctrl.getSettlementReport);
  app.get('/reports/financial-summary', ctrl.getFinancialSummaryReport);
  app.get('/reports/invoice/:txId',     ctrl.getInvoicePdf);
}
