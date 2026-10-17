import { z } from 'zod';
export const interestTypes = ['internship', 'hackathon', 'scholarship', 'program', 'job'] as const;
export function splitSkillNames<T extends {name:string}>(entries:T[]):T[]{
  return entries.flatMap(entry=>entry.name.split(',').map(name=>({...entry,name:name.trim()})).filter(entry=>entry.name.length>0));
}

const optionalNumber = (min: number, max: number, integer = false) => z.preprocess(
  value => value === '' || value === null || value === undefined ? null : Number(value),
  (integer ? z.number().int() : z.number()).min(min).max(max).nullable(),
);
export const skillSchema = z.object({ name: z.string().trim().min(1).max(80), level: z.enum(['beginner','intermediate','advanced']) }).strict();

export const profileSchema = z.object({
  display_name: z.string().trim().max(100), degree: z.string().trim().max(100), branch: z.string().trim().max(100),
  academic_year: optionalNumber(1,8,true), graduation_year: optionalNumber(2000,2100,true), cgpa: optionalNumber(0,10),
  years_of_experience: optionalNumber(0, 50),
  career_goals: z.string().trim().max(2000), interest_types: z.array(z.enum(interestTypes)).max(10),
  preferred_locations: z.array(z.string().trim().min(1).max(80)).max(20),
}).strict();
// Stored links are not fetched in Slice 1. DNS and every redirect must also be
// validated at fetch time in Slice 2; syntax checks alone cannot prevent SSRF.
export function publicUrl(value: string): string {
  const url = new URL(value); const host = url.hostname.toLowerCase();
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port)))
    throw new Error('Use a public http or https link without login details or a custom port.');
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') || host.startsWith('[')
      || /^\d+\.\d+\.\d+\.\d+$/.test(host)) throw new Error('Use a public website address.');
  url.hash = ''; return url.toString();
}
export const intakeSchema = z.object({
  request_id: z.string().uuid(),
  source_type: z.enum(['text', 'url', 'capture']),
  content: z.string().trim().min(1).max(20000),
  nonce: z.string().uuid().optional(),
  payload_hash: z.string().min(16).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict().superRefine((input, ctx) => {
  if (input.source_type === 'url') {
    try {
      if (input.content.length > 2048) throw new Error('Link too long');
      publicUrl(input.content);
    } catch {
      ctx.addIssue({ code: 'custom', path: ['content'], message: 'Enter a public website link (http or https).' });
    }
  }
  if (input.source_type === 'capture') {
    if (!input.nonce) {
      ctx.addIssue({ code: 'custom', path: ['nonce'], message: 'Capture nonce is required for bookmarklet saves.' });
    }
    if (!input.payload_hash) {
      ctx.addIssue({ code: 'custom', path: ['payload_hash'], message: 'Payload hash binding is required for bookmarklet saves.' });
    }
  }
});

