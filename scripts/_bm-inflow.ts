import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();const J=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?Number(v):v,2);
async function q(l:string,s:string){try{console.log(`\n### ${l}\n`+J(await p.$queryRawUnsafe(s)));}catch(e:any){console.log(`\n### ${l}\nERR ${e.message?.slice(0,200)}`);}}
(async()=>{
await q("signups_daily_aug25_sep17", `select to_char("createdAt"+interval '9 hours','MM-DD Dy') d, count(*) n from academies where "createdAt">='2026-08-24T15:00:00Z' group by 1, date_trunc('day',"createdAt"+interval '9 hours') order by date_trunc('day',"createdAt"+interval '9 hours')`);
// 추적 가능한 3채널
await q("referrals_by_month", `select to_char("createdAt"+interval '9 hours','YYYY-MM') m, count(*) n from referrals group by 1 order by 1`);
await q("promo_link_events_by_month", `select to_char("createdAt"+interval '9 hours','YYYY-MM') m, kind, count(*) n, count(distinct "visitorKey") uniq, count(*) filter (where "staffId" is null) anon from credit_promotion_link_events group by 1,2 order by 1,2`);
await q("coupon_claims_by_month", `select to_char("claimedAt"+interval '9 hours','YYYY-MM') m, count(*) claims, count(distinct "claimedByAcademyId") academies from printable_coupon_codes where "claimedAt" is not null group by 1 order by 1`);
await q("coupon_batches", `select left("batchName",40) b, quantity, (select count(*) from printable_coupon_codes c where c."batchId"=pb.id and c."claimedAt" is not null) claimed, "createdAt"::date from printable_coupon_batches pb order by "createdAt"`);
// 9월 가입자 중 채널 귀속 가능한 비율
await q("sept_signup_attribution", `
 with s as (select id from academies where "createdAt">='2026-08-31T15:00:00Z')
 select count(*) sept_signups,
  count(*) filter (where exists(select 1 from referrals r where r."referredAcademyId"=s.id)) via_referral,
  count(*) filter (where exists(select 1 from printable_coupon_codes c where c."claimedByAcademyId"=s.id)) via_coupon,
  count(*) filter (where exists(select 1 from credit_promotion_link_events e where e."academyId"=s.id)) via_promo_link
 from s`);
// settings JSON 에 출처 흔적이 있나
await q("academy_settings_keys", `select k, count(*) from academies, jsonb_object_keys(case when settings ~ '^\s*\{' then settings::jsonb else '{}'::jsonb end) k group by 1 order by 2 desc limit 20`);
// 9월 가입자의 로그인 후 첫 화면 (진입 의도 간접 신호)
await q("sept_first_path", `
 with s as (select id from academies where "createdAt">='2026-08-31T15:00:00Z'),
      f as (select distinct on (e."academyId") e."academyId", e.metadata->>'path' path from app_events e join s on s.id=e."academyId" where e."eventType"='PAGE_VIEW' order by e."academyId", e."createdAt")
 select regexp_replace(path,'/[a-z0-9]{20,}','/:id','g') path, count(*) from f group by 1 order by 2 desc limit 12`);
await q("sept_second_paths", `
 with s as (select id from academies where "createdAt">='2026-08-31T15:00:00Z')
 select regexp_replace(e.metadata->>'path','/[a-z0-9]{20,}','/:id','g') path, count(distinct e."academyId") academies
 from app_events e join s on s.id=e."academyId" where e."eventType"='PAGE_VIEW' group by 1 order by 2 desc limit 15`);
await p.$disconnect();})();
