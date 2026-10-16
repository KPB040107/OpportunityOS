import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFieldRelevance, normalizeBranch, isTechOrCsBranch, isDataScienceBranch } from './field-relevance.mjs';

test('normalizeBranch handles aliases and variants', () => {
  assert.equal(normalizeBranch('Computer Science and Engineering'), 'computer science and engineering');
  assert.equal(normalizeBranch('CSE'), 'cse');
  assert.equal(normalizeBranch('AI & DS'), 'ai & ds');
  assert.equal(normalizeBranch(null), '');
});

test('isTechOrCsBranch identifies CS variants', () => {
  assert.equal(isTechOrCsBranch('Computer Science'), true);
  assert.equal(isTechOrCsBranch('Computer Science and Engineering'), true);
  assert.equal(isTechOrCsBranch('CSE'), true);
  assert.equal(isTechOrCsBranch('Information Technology'), true);
  assert.equal(isTechOrCsBranch('Software Engineering'), true);
  assert.equal(isTechOrCsBranch('Mechanical Engineering'), false);
});

test('isDataScienceBranch identifies DS variants', () => {
  assert.equal(isDataScienceBranch('Data Science'), true);
  assert.equal(isDataScienceBranch('Data Science and Engineering'), true);
  assert.equal(isDataScienceBranch('Artificial Intelligence & Data Science'), true);
  assert.equal(isDataScienceBranch('AI & ML'), true);
  assert.equal(isDataScienceBranch('Mechanical Engineering'), false);
});

test('Computer Science student: receives CS and Data Science roles, excludes non-tech roles', () => {
  const branch = 'Computer Science and Engineering';

  // Tech / Software roles included
  assert.equal(checkFieldRelevance(branch, 'Software Engineer, Intern').relevant, true);
  assert.equal(checkFieldRelevance(branch, 'Backend Engineering Intern').relevant, true);
  assert.equal(checkFieldRelevance(branch, 'Frontend Developer').relevant, true);
  assert.equal(checkFieldRelevance(branch, 'AI Security Research & Red Team Engineer').relevant, true);

  // Data Science roles included for CS student (DS is part of CS)
  assert.equal(checkFieldRelevance(branch, 'PhD Data Scientist, Intern').relevant, true);
  assert.equal(checkFieldRelevance(branch, 'AM/ Manager - Risk & Decision Science').relevant, true);
  assert.equal(checkFieldRelevance(branch, 'Machine Learning Engineer Intern').relevant, true);

  // Hackathons included
  assert.equal(checkFieldRelevance(branch, 'Qloo Agentic Hackathon', [], 'hackathon').relevant, true);
  assert.equal(checkFieldRelevance(branch, 'PayPal AI Hackathon', [], 'hackathon').relevant, true);

  // Non-tech roles strictly EXCLUDED
  const marketing = checkFieldRelevance(branch, 'Assistant Manager - Performance Marketing');
  assert.equal(marketing.relevant, false);
  assert.ok(marketing.reason.includes('Performance Marketing'));

  const finance = checkFieldRelevance(branch, 'Assistant Manager - Business Finance');
  assert.equal(finance.relevant, false);

  const director = checkFieldRelevance(branch, 'Associate Director - Business Finance');
  assert.equal(director.relevant, false);

  const sales = checkFieldRelevance(branch, 'Account Executive, FedCiv');
  assert.equal(sales.relevant, false);

  const bdr = checkFieldRelevance(branch, 'Business Development Representative (BDR)');
  assert.equal(bdr.relevant, false);

  const legal = checkFieldRelevance(branch, 'Associate General Counsel, Privacy Compliance');
  assert.equal(legal.relevant, false);

  const logistics = checkFieldRelevance(branch, 'Cluster Head -Last Mile - Rajasthan');
  assert.equal(logistics.relevant, false);
});

test('Data Science student: receives Data Science roles AND general CS listings (user requirement), excludes non-tech', () => {
  const branch = 'Data Science';

  // Data Science roles included
  assert.equal(checkFieldRelevance(branch, 'PhD Data Scientist, Intern').relevant, true);
  assert.equal(checkFieldRelevance(branch, 'AM/ Manager - Risk & Decision Science').relevant, true);
  assert.equal(checkFieldRelevance(branch, 'Machine Learning Engineer Intern').relevant, true);

  // General CS / Software Engineering roles ALSO included (since Data Science is part of CS)
  assert.equal(checkFieldRelevance(branch, 'Software Engineer, Intern').relevant, true);
  assert.equal(checkFieldRelevance(branch, 'Backend Engineering Intern').relevant, true);
  assert.equal(checkFieldRelevance(branch, 'Frontend Developer').relevant, true);
  assert.equal(checkFieldRelevance(branch, 'DevOps Platform Engineer').relevant, true);

  // Hackathons included
  assert.equal(checkFieldRelevance(branch, 'Qloo Agentic Hackathon', [], 'hackathon').relevant, true);

  // Non-tech roles strictly EXCLUDED
  assert.equal(checkFieldRelevance(branch, 'Assistant Manager - Performance Marketing').relevant, false);
  assert.equal(checkFieldRelevance(branch, 'Associate Director - Business Finance').relevant, false);
  assert.equal(checkFieldRelevance(branch, 'Account Executive, Indonesia').relevant, false);
  assert.equal(checkFieldRelevance(branch, 'Associate General Counsel, Privacy Compliance').relevant, false);
});

test('Empty profile branch does not block opportunities', () => {
  assert.equal(checkFieldRelevance('', 'Software Engineer').relevant, true);
  assert.equal(checkFieldRelevance(null, 'Assistant Manager - Performance Marketing').relevant, true);
});
