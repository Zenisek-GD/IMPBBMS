import { AppEntry } from '../models/appEntryModel.js';
import { Appropriation } from '../models/appropriationModel.js';
import { PrHeader } from '../models/prModel.js';
import { Rfq, Award } from '../models/biddingModel.js';
import { Contract, Delivery } from '../models/contractModel.js';
import { Invoice } from '../models/paymentModel.js';
import { InvestmentProgram } from '../models/investmentProgramModel.js';
import { ExecutiveBudget } from '../models/budgetPreparationModel.js';
import { fundingIncludes, fundingYearOf } from './fundingYear.js';

const appInclude = [{ model: Appropriation, as: 'appropriation', attributes: ['fiscalYear'] }];
const rfqInclude = [{ model: Rfq, as: 'rfq', include: fundingIncludes() }];
const contractInclude = [{ model: Award, as: 'award', include: rfqInclude }];

// Fiscal origin follows the referenced business record, never the date the
// document was printed. Cache by reference during a list request.
export const createDocumentFiscalYearResolver = () => {
  const cache = new Map();
  return async ({ entityRef, entityId }) => {
    const key = `${entityRef}:${entityId}`;
    if (!cache.has(key)) cache.set(key, (async () => {
      if (['app', 'appEntry'].includes(entityRef)) {
        const app = await AppEntry.findByPk(entityId, { include: appInclude });
        return app?.appropriation?.fiscalYear ?? app?.fiscalYear ?? null;
      }
      if (['pr', 'prHeader', 'purchaseRequisition'].includes(entityRef)) return fundingYearOf(await PrHeader.findByPk(entityId, { include: [{ model: AppEntry, as: 'appEntry', include: appInclude }] }));
      if (entityRef === 'rfq') return fundingYearOf(await Rfq.findByPk(entityId, { include: fundingIncludes() }));
      if (entityRef === 'award') return fundingYearOf((await Award.findByPk(entityId, { include: rfqInclude }))?.rfq);
      if (entityRef === 'contract') return fundingYearOf((await Contract.findByPk(entityId, { include: contractInclude }))?.award?.rfq);
      if (['delivery', 'invoice'].includes(entityRef)) {
        const model = entityRef === 'delivery' ? Delivery : Invoice;
        return fundingYearOf((await model.findByPk(entityId, { include: [{ model: Contract, as: 'contract', include: contractInclude }] }))?.contract?.award?.rfq);
      }
      if (['aip', 'investmentProgram'].includes(entityRef)) return (await InvestmentProgram.findByPk(entityId))?.fiscalYear ?? null;
      if (['budget', 'executiveBudget'].includes(entityRef)) return (await ExecutiveBudget.findByPk(entityId))?.fiscalYear ?? null;
      return null;
    })());
    return cache.get(key);
  };
};
