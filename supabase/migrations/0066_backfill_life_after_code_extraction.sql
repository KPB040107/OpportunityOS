-- Migration 0066: Backfill full-listing reading and extraction for Life After Code hackathon
begin;

update public.opportunities
set
  deadline = '2026-10-27',
  requirements_status = 'REQUIREMENTS_PRESENT',
  skills = array['Git', 'REST APIs'],
  description = 'Code generation is solved. What happens next is the challenge. Life After Code is the GitLab Transcend Hackathon. Build agents and flows that take over the rest of the DevSecOps lifecycle: code review, security scanning, testing, compliance, deployment, monitoring, and more. Compete for $45,000 in cash. Register on Devpost.',
  extracted_json = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          extracted_json,
          '{deadline}',
          '"2026-10-27"'
        ),
        '{fields,deadline}',
        '"2026-10-27"'
      ),
      '{fields,deadline_display}',
      '"Deadline: Oct 27, 2026 @ 1:00pm UTC (6:30 PM IST)"'
    ),
    '{fields,deadline_time}',
    '"18:30:00+05:30"'
  ),
  updated_at = now()
where id = '9f8d85e1-09e2-4ab5-8222-3f1e23ac0667';

delete from public.opportunity_requirements where opportunity_id = '9f8d85e1-09e2-4ab5-8222-3f1e23ac0667';

insert into public.opportunity_requirements (user_id, opportunity_id, kind, value, mandatory, evidence_snippet, requirement_class, quote, status)
values
  ('def0125f-f742-4578-a41f-7108baa74d16', '9f8d85e1-09e2-4ab5-8222-3f1e23ac0667', 'other', 'Submission deadline: 2026-10-27', true, 'Deadline: Oct 27, 2026 @ 1:00pm UTC', 'mandatory_eligibility', 'Deadline: Oct 27, 2026 @ 1:00pm UTC', 'active'),
  ('def0125f-f742-4578-a41f-7108baa74d16', '9f8d85e1-09e2-4ab5-8222-3f1e23ac0667', 'other', 'Above legal age of majority in country of residence', true, 'Above legal age of majority in country of residence', 'mandatory_eligibility', 'Above legal age of majority in country of residence', 'active'),
  ('def0125f-f742-4578-a41f-7108baa74d16', '9f8d85e1-09e2-4ab5-8222-3f1e23ac0667', 'location', 'Specific countries/territories excluded', true, 'Specific countries/territories excluded', 'mandatory_eligibility', 'Specific countries/territories excluded', 'active'),
  ('def0125f-f742-4578-a41f-7108baa74d16', '9f8d85e1-09e2-4ab5-8222-3f1e23ac0667', 'location', 'Participation location: Online', false, 'Location: Online', 'other_requirement', 'Location: Online', 'active'),
  ('def0125f-f742-4578-a41f-7108baa74d16', '9f8d85e1-09e2-4ab5-8222-3f1e23ac0667', 'other', 'Prizes: $45,000', false, 'Prizes: $45,000', 'benefit', 'Prizes: $45,000', 'active'),
  ('def0125f-f742-4578-a41f-7108baa74d16', '9f8d85e1-09e2-4ab5-8222-3f1e23ac0667', 'skill', 'Git', false, 'Life After Code is the GitLab Transcend Hackathon.', 'required_skill', 'Life After Code is the GitLab Transcend Hackathon.', 'active');

update public.matches
set
  status = 'complete',
  eligibility_status = 'ELIGIBLE',
  eligibility_checks = '[
    {"kind": "deadline", "status": "PASS", "reason": "The deadline is in 10 days.", "evidence": "2026-10-27"},
    {"kind": "eligibility", "status": "PASS", "reason": "Participant meets age of majority requirement (university student in India).", "evidence": "Above legal age of majority in country of residence"},
    {"kind": "location", "status": "PASS", "reason": "Participant resides in an eligible country (India) not on excluded lists.", "evidence": "Specific countries/territories excluded"}
  ]'::jsonb,
  component_scores = '{
    "skill_fit": {"value": 0.8, "weight": 40, "points": 32, "required_coverage": 0.5, "preferred_coverage": null},
    "career_alignment": {"value": 0.7, "weight": 20, "points": 14},
    "interest_fit": {"value": 1, "weight": 15, "points": 15},
    "location_fit": {"value": 1, "weight": 10, "points": 10},
    "profile_fit": {"value": null, "weight": 10, "points": 0},
    "urgency": {"value": 0.75, "weight": 5, "points": 3.75},
    "required_skill_coverage": {"value": 0.5, "weight": 0, "points": 0, "matched": ["git"], "missing": ["rest apis"]},
    "preferred_skill_coverage": {"value": null, "weight": 0, "points": 0, "matched": [], "missing": []}
  }'::jsonb,
  match_score = 74.75,
  confidence = 0.85,
  confidence_inputs = '{
    "completeness": 1,
    "verified_evidence": 1,
    "clarity": 1,
    "model_confidence": 0.85,
    "weights": {"completeness": 0.3, "verified_evidence": 0.3, "clarity": 0.25, "model_confidence": 0.15}
  }'::jsonb,
  decision = 'ACT',
  reason_codes = array['ELIGIBLE_STRONG_MATCH'],
  explanation = 'Eligible and above both balanced thresholds. Match score 75/100; confidence 85%.',
  mode = 'balanced',
  policy_version = 'decision-v2',
  match_version = 'match-v1',
  decided_at = now(),
  updated_at = now()
where opportunity_id = '9f8d85e1-09e2-4ab5-8222-3f1e23ac0667';

commit;
