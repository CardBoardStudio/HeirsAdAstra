// drawing_board's review-guidance rules. The generic engine is review-guidance/core.cjs.
// Subjects stay in this repo's "Area: sentence" git style, not Conventional Commits:
// release notes come from changes/*.md, so a type prefix would carry no information.
module.exports = {
  // The single switch: 'warn' reports findings and never fails the PR; 'fail' blocks it.
  mode: 'warn',
  sections: [
    { heading: 'How to review', hint: 'name where to start, the risky areas and what to skim' },
    { heading: 'Decisions for review', hint: 'list the choices a reviewer could make differently, or write "None."' },
  ],
  subjectMax: 72,
  bodyRequiredOver: 30,
  // The release cut PR is written by a workflow, not a reviewer-facing template.
  skip: event => Boolean(event.pull_request?.head?.ref?.startsWith('release/')),
};
