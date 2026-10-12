import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSkillNames,skillSchema} from '../web/src/lib/validation.ts';
import {createDecisionContract} from './decision-contract.mjs';
test('comma-separated entries remain individual skills with the chosen level and can satisfy a hard skill check',()=>{
 const skills=splitSkillNames([skillSchema.parse({name:'JSON, JavaScript, java, MongoDB',level:'beginner'})]);
 assert.deepEqual(skills.map(s=>s.name),['JSON','JavaScript','java','MongoDB']);assert.ok(skills.every(s=>s.level==='beginner'));
 const p=createDecisionContract({hash:s=>s});
 const result=p.eligibility({profile:{skills},opportunity:{deadline:'2026-10-25',ambiguity_flags:[]},requirements:[{kind:'skill',value:'JavaScript',mandatory:true,normalized_value:{name:'javascript'},evidence:'Required skill: JavaScript.'}]},'2026-10-12T10:00:00Z');
 assert.equal(result.status,'ELIGIBLE');
});
