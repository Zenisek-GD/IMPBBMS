export function publicProjectStatus(project, fallback) {
  switch (project.clientReportedStatus) {
    case 'Completed / Awarded':
      return project.category === 'awarded' ? 'Awarded' : fallback
    case 'Awarded / For implementation':
      return 'Ongoing · For implementation'
    default:
      return fallback
  }
}
