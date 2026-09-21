import './config/env.js';
import { sequelize } from './models/index.js';
import { migrateProcurementSchedule } from './services/migrateProcurementSchedule.js';
try { await sequelize.authenticate(); console.log('Schedule migration complete:', await migrateProcurementSchedule()); }
catch (error) { console.error('Schedule migration failed:', error.message); process.exitCode = 1; }
finally { await sequelize.close(); }
