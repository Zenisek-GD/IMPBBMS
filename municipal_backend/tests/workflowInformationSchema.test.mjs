import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as models from '../models/index.js';
import { prepareWorkflowInformation } from '../services/workflowInformation.js';

after(() => models.sequelize.close());

test('every offered unavailable value fits the existing nullable database column', async () => {
  const examples = [
    ['DevelopmentPlan', '/planning/plans/1', 'vision remarks'],
    ['DevelopmentGoal', '/planning/goals/1', 'subsector description'],
    ['InvestmentProgram', '/planning/investment-programs/1', 'remarks'],
    ['AipEntry', '/planning/aip-entries/1', 'reference description expectedOutput papCode remarks implementingUnitId'],
    ['BudgetProceeding', '/budget-preparation/proceedings/1', 'venue agenda minutes heldAt departmentId'],
    ['BudgetProposal', '/budget-preparation/proposals/1', 'justification'],
    ['AppEntry', '/app-entries/1', 'description categoryDetails papCode uacsCode unit quantity abc category procurementMode aipEntryId appropriationId fundSource accountCode targetStartQuarter targetCompletionQuarter procurementStrategy'],
    ['Rfq', '/bidding/rfqs/1/information', 'openingVenue procurementContactPerson procurementContactEmail requiredSupplierDocuments'],
    ['Contract', '/contracts/1', 'poRef terms startDate deliveryDeadline contractDays'],
    ['Delivery', '/contracts/1/deliveries', 'description deliveredAt'],
    ['Invoice', '/finance/invoices', 'supplierInvoiceRef remarks'],
    ['Payment', '/finance/payments/1/release', 'method reference'],
    ['Appropriation', '/finance/appropriations/1', 'ordinanceDate papCode uacsCode remarks departmentId'],
    ['Announcement', '/announcements/1', 'venue contactPerson contactEmail contactPhone referenceNo fundSource procurementMethodCitation expiresAt'],
  ];
  for (const [name, route, names] of examples) {
    const Model = models[name];
    assert.ok(Model, name);
    const fields = names.split(' ');
    const result = prepareWorkflowInformation(route, 'PATCH', Object.fromEntries(fields.map(key => [key, 'N/A'])));
    for (const field of fields) {
      assert.equal(result.body[field], null, `${name}.${field} normalizes to null`);
      assert.notEqual(Model.getAttributes()[field]?.allowNull, false, `${name}.${field} accepts null`);
      assert.ok(Model.getAttributes()[field], `${name}.${field} exists`);
    }
    await Model.build(result.body).validate({ fields });
  }
});

test('schema requirements for accounts and financial amounts remain mandatory', () => {
  for (const [name, field] of [['User', 'email'], ['User', 'password'], ['Invoice', 'amount'], ['Payment', 'amount'], ['AipEntry', 'estimatedCost']]) {
    assert.equal(models[name].getAttributes()[field].allowNull, false, `${name}.${field}`);
  }
});
