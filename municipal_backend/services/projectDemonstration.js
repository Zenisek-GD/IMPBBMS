// Task-owner-authorized demonstration, 4 November 2026. This deployment
// manifest attaches a scenario to an existing public project; it never writes
// approvals, contracts, deliveries or payments into the official ledger.
const title = 'Procurement of Disaster Response and Emergency Preparedness Equipment';
const milestones = [
  ['Planning', 'One lot of disaster response equipment; PHP 1,500,000 planning estimate.'],
  ['Requisition', 'Equipment includes generators, rescue ropes, life jackets, emergency lights, first-aid kits, handheld radios and tarpaulins.'],
  ['Solicitation', 'Competitive Bidding scenario using the client form’s March 2026 schedule.'],
  ['Bid opening', 'Demonstration opening and compliance review completed.'],
  ['Evaluation', 'Demonstration evaluation and post-qualification completed.'],
  ['Award', 'Client reference: Green Thumb, Inc.; PHP 1,468,000; NOA-2026-029.'],
  ['Contract', 'Demonstration implementation completed for the equipment lot.'],
  ['Completion', 'Demonstration delivery, acceptance and settlement completed; no actual delivery or payment is asserted.'],
].map(([stage, detail]) => ({ stage, detail, status: 'Completed', recordType: 'demonstration' }));

export function applyProjectDemonstration(project) {
  if (Number(project.id) !== 1 || project.projectTitle !== title || Number(project.fiscalYear) !== 2026 || Number(project.financials?.budget) !== 1500000) return project;
  return {
    ...project,
    category: 'completed', phase: 'completion', phaseLabel: 'Completed demonstration', progressPercent: 100,
    demonstration: {
      reference: 'MDRRMO-2026-001-DEMONSTRATION',
      source: 'Procurement_Information_Form_New_Project_2026.docx',
      actualClientStatus: 'Awarded / For implementation',
      officialCategory: project.category, officialPhase: project.phase,
      notice: 'Completed demonstration scenario. Client-reported status: Awarded / For implementation. Demonstration milestones are illustrative; official transactions and financial totals remain separate.',
      milestones,
    },
  };
}
