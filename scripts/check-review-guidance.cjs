// Runs the shared review-guidance core with drawing_board's config.
const core = require('./review-guidance/core.cjs');
const config = require('./review-guidance.config.cjs');
if (require.main === module) process.exitCode = core.run(config);
module.exports = { config, core };
