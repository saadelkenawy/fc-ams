import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { requireModule } from '../middleware/requireModule';
import * as ctrl from '../controllers/product.controller';

export async function productRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireModule);

  app.get('/products/search', {
    schema: {
      tags: ['products'],
      summary: 'Autocomplete search across EDA medicine & cosmetic registry',
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: {
            type: 'string',
            minLength: 2,
            maxLength: 100,
            description: 'Trade name, generic name, or active ingredient (Arabic or English)',
          },
          type: {
            type: 'string',
            enum: ['medicine', 'cosmetic'],
            description: 'Filter by product type; omit for both',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
            default: 20,
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            query:   { type: 'string' },
            total:   { type: 'integer' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id:                   { type: 'string', format: 'uuid' },
                  tradeNameEn:          { type: 'string' },
                  tradeNameAr:          { type: ['string', 'null'] },
                  type:                 { type: 'string', enum: ['medicine', 'cosmetic'] },
                  genericNameEn:        { type: ['string', 'null'] },
                  strength:             { type: ['string', 'null'] },
                  formCode:             { type: ['string', 'null'] },
                  formNameEn:           { type: ['string', 'null'] },
                  formNameAr:           { type: ['string', 'null'] },
                  prescriptionRequired: { type: ['boolean', 'null'] },
                  controlledSubstance:  { type: ['boolean', 'null'] },
                  rank:                 { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  }, ctrl.searchProducts);
}
