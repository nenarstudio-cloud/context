-- Documents and surveys as plain tables (direct-mode fallback). Run after supabase_1_ops.sql.
DROP SCHEMA IF EXISTS docs CASCADE;
DROP SCHEMA IF EXISTS kobo CASCADE;


-- LOCAL DEV ONLY. In production the documents live in S3 (Parquet) and the surveys behind a REST API,
-- and Zetaris queries them in place. For local development and tests we load both into the same
-- Postgres as schemas docs and kobo so one database stands in for all three silos.
-- Run from the dataset root:  psql "$DATABASE_URL" -f sql/05_dev_load_docs_kobo.sql
CREATE SCHEMA IF NOT EXISTS docs;
CREATE TABLE docs.documents (
  doc_id text PRIMARY KEY, source_system text, source_path text, project_id text, doc_type text,
  title text, author_person_id text, created_on date, text text);
CREATE TABLE docs.document_chunks (
  chunk_id text PRIMARY KEY, doc_id text REFERENCES docs.documents, chunk_index int, project_id text, text text);
CREATE SCHEMA IF NOT EXISTS kobo;
CREATE TABLE kobo.kpi_definitions (
  kpi_id text PRIMARY KEY, project_id text, name text, unit text, target numeric, direction text,
  frequency text, is_cumulative boolean, form_id text);
CREATE TABLE kobo.kobo_submissions (
  submission_id text PRIMARY KEY, form_id text, kpi_id text REFERENCES kobo.kpi_definitions, project_id text,
  county text, ward text, period_month date, value numeric, sample_size int, enumerator text,
  submitted_at date, status text);


-- data: docs.documents
INSERT INTO docs.documents (doc_id,source_system,source_path,project_id,doc_type,title,author_person_id,created_on,text) VALUES
('doc-011','Google Drive','/Programmes/Garissa/Lessons/Cooperative_Livelihoods_Pilot_Lessons.docx','pr9','lessons_learned','Garissa Cooperative Livelihoods Pilot: Lessons Learned','p5','2024-04-10','The pilot showed the same pattern now visible in Garissa Maternal Health: 90% of the budget was spent by month 14 while only 58% of activities were complete.

A no-cost extension was requested when the gap reached about 25 points and was approved. In 2022 a different donor refused a late request made after a budget freeze.

Recommendation: request a no-cost extension as soon as the gap between budget used and activities delivered passes 20 percentage points. Do not wait for the donor to force the conversation.'),
('doc-001','Google Drive','/Programmes/Turkana Water/Lessons/Phase1_Lessons_Learned.docx','pr1','lessons_learned','Turkana Water Access Phase 1: Lessons Learned','p1','2024-08-20','Drilling during the March to May 2024 long rains delayed Phase 1 borehole rehabilitation by about 6 weeks across Lokichar and Kalokol wards. Access roads washed out and rig mobilisation was blocked by standing water at several sites.

Community water committees outperformed contractor-only maintenance by a wide margin. At 12 months, boreholes with an active committee were 91% functional, compared with 64% where maintenance was left to the contractor alone.

The team pre-notified Global Resilience Fund in March 2024 that a slip was likely. The donor accepted a revised milestone date without penalty and the relationship was preserved.

Recommendation: schedule drilling outside the long rains where possible, and pre-notify the donor at least 6 weeks ahead when a seasonal slip is expected.'),
('doc-123','SharePoint','/Programmes/Kisumu Youth Digital Skills/Routine/training_report_23','pr7','training_report','Training Report: Kisumu Youth Digital Skills (Jun 2025)','p10','2025-06-04','Notes from the team check-in. A 60-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-101','Outlook','/Programmes/Coastal Youth Employment Bridge/Routine/progress_report_01','pr3','progress_report','Progress Report: Coastal Youth Employment Bridge (Jun 2025)','p10','2025-06-11','Routine update for the period. Field teams completed scheduled visits and submitted data on time. Community feedback sessions were well attended. No issues were escalated this period.'),
('doc-146','Google Drive','/Programmes/Women in Enterprise: Lake Region/Routine/email_thread_46','pr2','email_thread','Email Thread: Women in Enterprise: Lake Region (Jun 2025)','p7','2025-06-14','Routine update for the period. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-117','Google Drive','/Programmes/Turkana Pastoralist Resilience Fund/Routine/email_thread_17','pr6','email_thread','Email Thread: Turkana Pastoralist Resilience Fund (Jun 2025)','p8','2025-06-19','Routine update for the period. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-107','Outlook','/Programmes/Coastal Youth Employment Bridge/Routine/training_report_07','pr3','training_report','Training Report: Coastal Youth Employment Bridge (Jun 2025)','p10','2025-06-20','Notes from the team check-in. A 54-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-124','Google Drive','/Programmes/Kisumu Youth Digital Skills/Routine/travel_request_24','pr7','travel_request','Travel Request: Kisumu Youth Digital Skills (Jun 2025)','p10','2025-06-28','Short progress note for the file. Travel request for a two-day field visit with 55 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-150','Outlook','/Programmes/Nairobi Civic Tech Lab/Routine/travel_request_50','pr5','travel_request','Travel Request: Nairobi Civic Tech Lab (Jul 2025)','p6','2025-07-11','Short progress note for the file. Travel request for a two-day field visit with 9 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-153','Google Drive','/Programmes/Turkana Pastoralist Resilience Fund/Routine/travel_request_53','pr6','travel_request','Travel Request: Turkana Pastoralist Resilience Fund (Jul 2025)','p8','2025-07-14','Summary of this month''s activity. Travel request for a two-day field visit with 13 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-161','Google Drive','/Programmes/Women in Enterprise: Lake Region/Routine/email_thread_61','pr2','email_thread','Email Thread: Women in Enterprise: Lake Region (Jul 2025)','p3','2025-07-18','Notes from the team check-in. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-103','Google Drive','/Programmes/Women in Enterprise: Lake Region/Routine/travel_request_03','pr2','travel_request','Travel Request: Women in Enterprise: Lake Region (Jul 2025)','p3','2025-07-21','Logistics and coordination update. Travel request for a two-day field visit with 39 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-122','SharePoint','/Programmes/Coastal Youth Employment Bridge/Routine/progress_report_22','pr3','progress_report','Progress Report: Coastal Youth Employment Bridge (Jul 2025)','p10','2025-07-25','Notes from the team check-in. Field teams completed scheduled visits and submitted data on time. Community feedback sessions were well attended. No issues were escalated this period.'),
('doc-156','SharePoint','/Programmes/Women''s Cooperative Credit Bridge/Routine/email_thread_56','pr8','email_thread','Email Thread: Women''s Cooperative Credit Bridge (Aug 2025)','p5','2025-08-08','Routine update for the period. Short exchange confirming dates for the next partner meeting and venue arrangements. No decisions required.'),
('doc-002','Google Drive','/Programmes/Turkana Water/Lessons/Phase2_Lessons_Learned.docx','pr1','lessons_learned','Turkana Water Access Phase 2: Lessons Learned','p1','2025-08-14','The long rains of 2025 again delayed drilling, this time by 8 weeks. The seasonal pattern first seen in Phase 1 repeated almost exactly, in the same wards.

Unlike 2024, the team did not warn the donor in advance. Global Resilience Fund learned of the slip after the milestone date had passed. The Q2 review meeting was tense, and the donor asked for monthly progress reporting for the following two quarters.

Three wards that relied on contractor-only maintenance had boreholes fail by month 9. Wards with active water committees did not show the same failures.

Recommendation: treat the long-rains delay as a planning assumption, not an exception, and notify the donor early.'),
('doc-137','Google Drive','/Programmes/Kisumu Youth Digital Skills/Routine/travel_request_37','pr7','travel_request','Travel Request: Kisumu Youth Digital Skills (Aug 2025)','p7','2025-08-17','Short progress note for the file. Travel request for a two-day field visit with 57 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-118','Outlook','/Programmes/Turkana Water Access Programme/Routine/training_report_18','pr1','training_report','Training Report: Turkana Water Access Programme (Aug 2025)','p8','2025-08-18','Summary of this month''s activity. A 14-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-128','Google Drive','/Programmes/Nairobi Civic Tech Lab/Routine/email_thread_28','pr5','email_thread','Email Thread: Nairobi Civic Tech Lab (Aug 2025)','p6','2025-08-21','Routine update for the period. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-104','Google Drive','/Programmes/Women''s Cooperative Credit Bridge/Routine/meeting_minutes_04','pr8','meeting_minutes','Meeting Minutes: Women''s Cooperative Credit Bridge (Aug 2025)','p9','2025-08-26','Short progress note for the file. Partners were updated on progress. Minor scheduling changes were agreed. 15 action points were recorded.'),
('doc-130','SharePoint','/Programmes/Turkana Pastoralist Resilience Fund/Routine/training_report_30','pr6','training_report','Training Report: Turkana Pastoralist Resilience Fund (Aug 2025)','p1','2025-08-26','Notes from the team check-in. A 10-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-148','SharePoint','/Programmes/Coastal Youth Employment Bridge/Routine/email_thread_48','pr3','email_thread','Email Thread: Coastal Youth Employment Bridge (Aug 2025)','p10','2025-08-31','Logistics and coordination update. Short exchange confirming dates for the next partner meeting and venue arrangements. No decisions required.'),
('doc-021','Google Drive','/Policies/Travel_Policy_v3.1.docx',NULL,'policy','Travel policy v3.1','p14','2025-09-01','Travel is approved by the Programme Manager for amounts below USD 2,000 and by the Finance Manager above that. Per diem rates are fixed by grade.

This version does not set a ceiling on travel spend per county or per project.'),
('doc-115','Outlook','/Programmes/Turkana Pastoralist Resilience Fund/Routine/progress_report_15','pr6','progress_report','Progress Report: Turkana Pastoralist Resilience Fund (Sep 2025)','p8','2025-09-09','Short progress note for the file. Training sessions ran as planned with 37 participants. Attendance registers are filed in the shared folder. Next round is scheduled for next month.'),
('doc-151','Google Drive','/Programmes/Nairobi Civic Tech Lab/Routine/training_report_51','pr5','training_report','Training Report: Nairobi Civic Tech Lab (Sep 2025)','p6','2025-09-24','Logistics and coordination update. A 60-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-152','Google Drive','/Programmes/Turkana Pastoralist Resilience Fund/Routine/meeting_minutes_52','pr6','meeting_minutes','Meeting Minutes: Turkana Pastoralist Resilience Fund (Sep 2025)','p1','2025-09-25','Notes from the team check-in. The team reviewed the workplan and confirmed responsibilities for the coming weeks. Action items were assigned and will be reviewed at the next meeting.'),
('doc-129','Google Drive','/Programmes/Coastal Youth Employment Bridge/Routine/email_thread_29','pr3','email_thread','Email Thread: Coastal Youth Employment Bridge (Sep 2025)','p10','2025-09-29','Routine update for the period. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-111','Google Drive','/Programmes/Women''s Cooperative Credit Bridge/Routine/email_thread_11','pr8','email_thread','Email Thread: Women''s Cooperative Credit Bridge (Oct 2025)','p5','2025-10-03','Notes from the team check-in. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-113','Google Drive','/Programmes/Turkana Water Access Programme/Routine/email_thread_13','pr1','email_thread','Email Thread: Turkana Water Access Programme (Oct 2025)','p1','2025-10-05','Logistics and coordination update. Short exchange confirming dates for the next partner meeting and venue arrangements. No decisions required.'),
('doc-135','SharePoint','/Programmes/Coastal Youth Employment Bridge/Routine/progress_report_35','pr3','progress_report','Progress Report: Coastal Youth Employment Bridge (Oct 2025)','p10','2025-10-17','Routine update for the period. Training sessions ran as planned with 18 participants. Attendance registers are filed in the shared folder. Next round is scheduled for next month.'),
('doc-155','SharePoint','/Programmes/Turkana Water Access Programme/Routine/travel_request_55','pr1','travel_request','Travel Request: Turkana Water Access Programme (Oct 2025)','p8','2025-10-17','Routine update for the period. Travel request for a two-day field visit with 51 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-105','SharePoint','/Programmes/Turkana Pastoralist Resilience Fund/Routine/email_thread_05','pr6','email_thread','Email Thread: Turkana Pastoralist Resilience Fund (Oct 2025)','p1','2025-10-21','Routine update for the period. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-120','SharePoint','/Programmes/Turkana Water Access Programme/Routine/meeting_minutes_20','pr1','meeting_minutes','Meeting Minutes: Turkana Water Access Programme (Oct 2025)','p4','2025-10-26','Summary of this month''s activity. Partners were updated on progress. Minor scheduling changes were agreed. 63 action points were recorded.'),
('doc-014','Google Drive','/Programmes/Nairobi Civic Tech/Lessons/Interim_Lessons_Learned.docx','pr5','lessons_learned','Nairobi Civic Tech Lab: Interim Lessons Learned','p2','2025-11-12','Open data portals decay without recurring maintenance. Hosting, security patching and a part-time data steward need a dedicated maintenance budget line, otherwise usage drops within about 6 months of the grant ending.

Recommendation: budget 8 to 10% of the build cost per year as a maintenance line, and include it in the closeout plan.'),
('doc-147','Google Drive','/Programmes/Coastal Youth Employment Bridge/Routine/travel_request_47','pr3','travel_request','Travel Request: Coastal Youth Employment Bridge (Nov 2025)','p10','2025-11-14','Short progress note for the file. Travel request for a two-day field visit with 10 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-149','SharePoint','/Programmes/Turkana Water Access Programme/Routine/email_thread_49','pr1','email_thread','Email Thread: Turkana Water Access Programme (Nov 2025)','p4','2025-11-14','Routine update for the period. Short exchange confirming dates for the next partner meeting and venue arrangements. No decisions required.'),
('doc-164','Google Drive','/Programmes/Women in Enterprise: Lake Region/Routine/meeting_minutes_64','pr2','meeting_minutes','Meeting Minutes: Women in Enterprise: Lake Region (Nov 2025)','p3','2025-11-15','Logistics and coordination update. The team reviewed the workplan and confirmed responsibilities for the coming weeks. Action items were assigned and will be reviewed at the next meeting.'),
('doc-114','Google Drive','/Programmes/Nairobi Civic Tech Lab/Routine/travel_request_14','pr5','travel_request','Travel Request: Nairobi Civic Tech Lab (Nov 2025)','p6','2025-11-16','Summary of this month''s activity. Travel request for a two-day field visit with 44 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-126','Outlook','/Programmes/Coastal Youth Employment Bridge/Routine/meeting_minutes_26','pr3','meeting_minutes','Meeting Minutes: Coastal Youth Employment Bridge (Nov 2025)','p10','2025-11-17','Logistics and coordination update. Partners were updated on progress. Minor scheduling changes were agreed. 35 action points were recorded.'),
('doc-154','Outlook','/Programmes/Nairobi Civic Tech Lab/Routine/progress_report_54','pr5','progress_report','Progress Report: Nairobi Civic Tech Lab (Nov 2025)','p2','2025-11-19','Notes from the team check-in. Training sessions ran as planned with 28 participants. Attendance registers are filed in the shared folder. Next round is scheduled for next month.'),
('doc-144','Google Drive','/Programmes/Turkana Pastoralist Resilience Fund/Routine/email_thread_44','pr6','email_thread','Email Thread: Turkana Pastoralist Resilience Fund (Dec 2025)','p8','2025-12-01','Logistics and coordination update. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-110','Outlook','/Programmes/Turkana Pastoralist Resilience Fund/Routine/training_report_10','pr6','training_report','Training Report: Turkana Pastoralist Resilience Fund (Dec 2025)','p1','2025-12-02','Logistics and coordination update. A 44-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-159','Outlook','/Programmes/Nairobi Civic Tech Lab/Routine/progress_report_59','pr5','progress_report','Progress Report: Nairobi Civic Tech Lab (Dec 2025)','p6','2025-12-09','Logistics and coordination update. Monitoring forms were collected from 35 sites. Enumerators reported good access. Data cleaning is under way.'),
('doc-127','Google Drive','/Programmes/Nairobi Civic Tech Lab/Routine/meeting_minutes_27','pr5','meeting_minutes','Meeting Minutes: Nairobi Civic Tech Lab (Dec 2025)','p2','2025-12-18','Notes from the team check-in. Partners were updated on progress. Minor scheduling changes were agreed. 29 action points were recorded.'),
('doc-108','Google Drive','/Programmes/Kisumu Youth Digital Skills/Routine/email_thread_08','pr7','email_thread','Email Thread: Kisumu Youth Digital Skills (Dec 2025)','p7','2025-12-19','Summary of this month''s activity. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-138','SharePoint','/Programmes/Turkana Pastoralist Resilience Fund/Routine/travel_request_38','pr6','travel_request','Travel Request: Turkana Pastoralist Resilience Fund (Dec 2025)','p1','2025-12-31','Logistics and coordination update. Travel request for a two-day field visit with 62 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-145','Outlook','/Programmes/Women in Enterprise: Lake Region/Routine/email_thread_45','pr2','email_thread','Email Thread: Women in Enterprise: Lake Region (Jan 2026)','p7','2026-01-06','Routine update for the period. Short exchange confirming dates for the next partner meeting and venue arrangements. No decisions required.'),
('doc-134','SharePoint','/Programmes/Women in Enterprise: Lake Region/Routine/training_report_34','pr2','training_report','Training Report: Women in Enterprise: Lake Region (Jan 2026)','p7','2026-01-19','Summary of this month''s activity. A 53-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-143','Google Drive','/Programmes/Turkana Water Access Programme/Routine/progress_report_43','pr1','progress_report','Progress Report: Turkana Water Access Programme (Jan 2026)','p8','2026-01-24','Routine update for the period. Training sessions ran as planned with 27 participants. Attendance registers are filed in the shared folder. Next round is scheduled for next month.'),
('doc-158','Google Drive','/Programmes/Nairobi Civic Tech Lab/Routine/progress_report_58','pr5','progress_report','Progress Report: Nairobi Civic Tech Lab (Jan 2026)','p6','2026-01-29','Short progress note for the file. Field teams completed scheduled visits and submitted data on time. Community feedback sessions were well attended. No issues were escalated this period.'),
('doc-112','SharePoint','/Programmes/Turkana Water Access Programme/Routine/training_report_12','pr1','training_report','Training Report: Turkana Water Access Programme (Feb 2026)','p4','2026-02-04','Notes from the team check-in. A 16-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-163','Google Drive','/Programmes/Nairobi Civic Tech Lab/Routine/training_report_63','pr5','training_report','Training Report: Nairobi Civic Tech Lab (Feb 2026)','p6','2026-02-11','Notes from the team check-in. A 44-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-160','Outlook','/Programmes/Turkana Water Access Programme/Routine/meeting_minutes_60','pr1','meeting_minutes','Meeting Minutes: Turkana Water Access Programme (Feb 2026)','p8','2026-02-19','Notes from the team check-in. The team reviewed the workplan and confirmed responsibilities for the coming weeks. Action items were assigned and will be reviewed at the next meeting.'),
('doc-125','SharePoint','/Programmes/Kisumu Youth Digital Skills/Routine/email_thread_25','pr7','email_thread','Email Thread: Kisumu Youth Digital Skills (Feb 2026)','p7','2026-02-21','Summary of this month''s activity. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-162','SharePoint','/Programmes/Turkana Pastoralist Resilience Fund/Routine/travel_request_62','pr6','travel_request','Travel Request: Turkana Pastoralist Resilience Fund (Mar 2026)','p8','2026-03-11','Logistics and coordination update. Travel request for a two-day field visit with 28 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-017','Google Drive','/Programmes/Women in Enterprise/Evaluation/Year3_Outcomes_Survey.docx','pr2','outcomes_survey','Women in Enterprise Year 3 outcomes survey','p3','2026-03-15','Twelve-month business survival rose from a baseline of 54% to 79%. Peer mentorship circles were the strongest single lever.

Releasing grants against savings-group milestones, rather than loan terms alone, nearly eliminated default: 3.1% against 14% where grants were not linked to milestones.

Women who completed financial literacy training were 2.3 times more likely to reinvest profit into the business.'),
('doc-106','Google Drive','/Programmes/Garissa Maternal Health Outreach/Routine/progress_report_06','pr4','progress_report','Progress Report: Garissa Maternal Health Outreach (Mar 2026)','p5','2026-03-22','Summary of this month''s activity. Field teams completed scheduled visits and submitted data on time. Community feedback sessions were well attended. No issues were escalated this period.'),
('doc-109','Outlook','/Programmes/Kisumu Youth Digital Skills/Routine/progress_report_09','pr7','progress_report','Progress Report: Kisumu Youth Digital Skills (Apr 2026)','p7','2026-04-05','Notes from the team check-in. Field teams completed scheduled visits and submitted data on time. Community feedback sessions were well attended. No issues were escalated this period.'),
('doc-133','SharePoint','/Programmes/Coastal Youth Employment Bridge/Routine/training_report_33','pr3','training_report','Training Report: Coastal Youth Employment Bridge (Apr 2026)','p10','2026-04-11','Routine update for the period. A 14-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-132','Google Drive','/Programmes/Turkana Pastoralist Resilience Fund/Routine/meeting_minutes_32','pr6','meeting_minutes','Meeting Minutes: Turkana Pastoralist Resilience Fund (Apr 2026)','p1','2026-04-13','Logistics and coordination update. Partners were updated on progress. Minor scheduling changes were agreed. 45 action points were recorded.'),
('doc-119','Outlook','/Programmes/Turkana Water Access Programme/Routine/email_thread_19','pr1','email_thread','Email Thread: Turkana Water Access Programme (Apr 2026)','p8','2026-04-18','Short progress note for the file. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.');
INSERT INTO docs.documents (doc_id,source_system,source_path,project_id,doc_type,title,author_person_id,created_on,text) VALUES
('doc-018','Google Drive','/Programmes/Women in Enterprise/Workshops/Savings_Groups_Lessons.docx','pr2','lessons_learned','Lessons learned workshop: savings groups','p3','2026-04-22','Savings groups with a trained mentor met more consistently and had fewer withdrawals in the first year.

In pastoralist settings the structure of the credit product mattered as much as the training. Conventional interest-bearing products were refused by about 90% of applicants, while Sharia-compliant credit saw strong uptake.

Mentor circles should be established before any credit is disbursed.'),
('doc-139','Google Drive','/Programmes/Coastal Youth Employment Bridge/Routine/meeting_minutes_39','pr3','meeting_minutes','Meeting Minutes: Coastal Youth Employment Bridge (May 2026)','p10','2026-05-11','Short progress note for the file. Partners were updated on progress. Minor scheduling changes were agreed. 14 action points were recorded.'),
('doc-013','SharePoint','/sites/garissa/FieldNotes/Fafi_stockout_2026-05-12.docx','pr4','field_report','Field report: Fafi mobile clinic stock-outs','p9','2026-05-12','Stock-outs of antenatal consumables caused four mobile clinic days to be cancelled in Fafi during April and May. Attendance fell and mothers were redirected to a facility 40 km away.

Restocking was delayed by supplier issues. Vehicle hire and fuel costs continued to be incurred on the cancelled days.'),
('doc-157','SharePoint','/Programmes/Turkana Pastoralist Resilience Fund/Routine/training_report_57','pr6','training_report','Training Report: Turkana Pastoralist Resilience Fund (May 2026)','p8','2026-05-13','Logistics and coordination update. A 48-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-025','Google Drive','/Programmes/Coastal Youth/FieldNotes/Mtwapa_flooding_2026-05-20.docx','pr3','field_report','Field report: Mtwapa training centre flooding','p10','2026-05-20','Heavy rain left standing water in the training centre compound. Classes were moved to a partner venue for four days. No equipment was damaged.'),
('doc-136','Outlook','/Programmes/Women in Enterprise: Lake Region/Routine/meeting_minutes_36','pr2','meeting_minutes','Meeting Minutes: Women in Enterprise: Lake Region (May 2026)','p7','2026-05-23','Summary of this month''s activity. Partners were updated on progress. Minor scheduling changes were agreed. 61 action points were recorded.'),
('doc-022','Google Drive','/Policies/Procurement_Policy_Draft_v0.4.docx',NULL,'policy','Procurement policy: draft update v0.4','p15','2026-05-30','Proposes that purchases above USD 75,000 require Executive Director approval, with a target turnaround of 10 working days.

The draft does not yet include an escalation rule for supplier contracts that remain unsigned for more than 14 days.'),
('doc-140','SharePoint','/Programmes/Kisumu Youth Digital Skills/Routine/training_report_40','pr7','training_report','Training Report: Kisumu Youth Digital Skills (Jun 2026)','p10','2026-06-03','Logistics and coordination update. A 54-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-121','Outlook','/Programmes/Kisumu Youth Digital Skills/Routine/meeting_minutes_21','pr7','meeting_minutes','Meeting Minutes: Kisumu Youth Digital Skills (Jun 2026)','p7','2026-06-09','Notes from the team check-in. Partners were updated on progress. Minor scheduling changes were agreed. 40 action points were recorded.'),
('doc-141','SharePoint','/Programmes/Women''s Cooperative Credit Bridge/Routine/progress_report_41','pr8','progress_report','Progress Report: Women''s Cooperative Credit Bridge (Jun 2026)','p5','2026-06-09','Summary of this month''s activity. Field teams completed scheduled visits and submitted data on time. Community feedback sessions were well attended. No issues were escalated this period.'),
('doc-016','SharePoint','/sites/nairobi/Meetings/EU_Donor_Review_2026-06-10.docx','pr5','donor_review','Nairobi donor review minutes','p2','2026-06-10','Attendees: David Mwangi, Peter Njoroge, Christopher Mbugua and the EU Devolution Facility programme officer.

The EU asked about sustainability after grant end. County government interest was noted, but no funds are committed.

The EU stated that the closeout report due on 31 July must contain a sustainability plan with a costed budget.'),
('doc-019','SharePoint','/sites/garissa/Health/Cooperative_Health_Check_Q2_2026.docx','pr8','health_check','Cooperative health check, Q2 2026','p5','2026-06-12','Cooperative disputes rose to 6 in Q2 from 4 in Q1, after falling from 11 in Q3 2025. Leadership training delivered in Q4 2025 reduced disputes, but no refresher has been scheduled.

The Garissa cooperative programme has no peer mentorship structure, unlike the Kisumu programme. Sharia-compliant products continue to see strong uptake.'),
('doc-116','Google Drive','/Programmes/Nairobi Civic Tech Lab/Routine/progress_report_16','pr5','progress_report','Progress Report: Nairobi Civic Tech Lab (Jun 2026)','p2','2026-06-12','Notes from the team check-in. Training sessions ran as planned with 15 participants. Attendance registers are filed in the shared folder. Next round is scheduled for next month.'),
('doc-024','SharePoint','/sites/turkana/FieldNotes/Kakuma_water_points_2026-06-15.docx','pr6','site_visit_note','Site visit: Kakuma ward water points','p8','2026-06-15','All eleven water points visited in Kakuma ward were functioning. Equipment is available and no delays are expected for the Pastoralist Resilience programme in this ward.'),
('doc-142','Outlook','/Programmes/Kisumu Youth Digital Skills/Routine/email_thread_42','pr7','email_thread','Email Thread: Kisumu Youth Digital Skills (Jun 2026)','p7','2026-06-17','Short progress note for the file. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-008','Google Drive','/Programmes/Turkana Water/Donor/GRF_Q2_review_call_notes.docx','pr1','donor_review','Global Resilience Fund Q2 review call notes','p1','2026-06-18','The programme officer asked how confident we are in the Q3 milestone: all 14 wards drilled or rehabilitated by 30 September 2026.

She reminded us that after the 2025 delay they expect early warning of any slip. Next check-in is scheduled for 20 July 2026.

No commitments were made on the call about the date.'),
('doc-009','Google Drive','/Finance/Reviews/Garissa_Burn_Rate_Review_2026-06-18.docx','pr4','finance_review','Finance review: Garissa burn-rate flag','p6','2026-06-18','Garissa Maternal Health Outreach has spent 93% of its USD 540,000 budget, against 61% of planned activities completed. USD 37,800 remains.

The travel line is at 125% of its budget, driven by fuel and vehicle hire for mobile clinic rounds to Dadaab and Ijara. Personnel is at 99%. The works and equipment line is at 76%.

At the current rate of spending the remaining budget will be exhausted before the second round of outreach clinics is complete. This has been flagged to the Executive Director.'),
('doc-131','Outlook','/Programmes/Nairobi Civic Tech Lab/Routine/training_report_31','pr5','training_report','Training Report: Nairobi Civic Tech Lab (Jun 2026)','p2','2026-06-19','Summary of this month''s activity. A 29-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-010','SharePoint','/sites/garissa/Meetings/Budget_Reallocation_2026-06-20.docx','pr4','meeting_minutes','Emergency budget reallocation meeting','p6','2026-06-20','Attendees: Peter Njoroge, Fatuma Hassan, Halima Abdi, Mercy Wafula.

The group agreed to propose moving USD 18,000 from the M&E and Training lines to the travel line, subject to donor approval. This brings available funds to about USD 55,800.

Remaining activities cost an estimated USD 41,000 if delivered through a community health worker led model rather than mobile clinics. That is feasible only with an extension of the grant period to 31 December 2026, because the current end date is 30 September.

No decision was taken. The extension request and reallocation are waiting for the Executive Director.'),
('doc-102','Outlook','/Programmes/Turkana Pastoralist Resilience Fund/Routine/meeting_minutes_02','pr6','meeting_minutes','Meeting Minutes: Turkana Pastoralist Resilience Fund (Jun 2026)','p1','2026-06-23','Routine update for the period. The team reviewed the workplan and confirmed responsibilities for the coming weeks. Action items were assigned and will be reviewed at the next meeting.'),
('doc-003','SharePoint','/sites/turkana/FieldNotes/Lokichar_site_visit_2026-06-24.docx','pr1','site_visit_note','Site visit: Lokichar ward drilling sites','p4','2026-06-24','Visited five Phase 3 drilling sites in Lokichar ward. Standing water was present at three of the five sites (LK-03, LK-04, LK-05). The rig could not mobilise to any of the three. Photographs IMG_2201 to IMG_2214 are attached to the site folder.

The access road to LK-04 is impassable. Rains have continued later than usual this season. If they persist, I estimate 5 to 6 weeks before the ground is dry enough to drill.

Two sites (LK-01, LK-02) are workable, but the rig spares requested on 20 June are still outstanding and drilling cannot restart without them.

Recommend informing Global Resilience Fund now of a likely slip of around 6 weeks.'),
('doc-020','Google Drive','/Board/Papers/2026-06/Q2_Financial_Overview.docx',NULL,'board_paper','Board paper: Q2 financial overview','p6','2026-06-25','Organisation-wide travel spend rose 11% in Q2 2026 compared with Q1 2026. The travel policy has no per-county ceiling.

Two projects are running above their planned burn rate: Turkana Water Access and Garissa Maternal Health Outreach. Other projects are at or below plan.

A procurement policy update is in progress, with adoption targeted for the September board meeting.'),
('doc-015','Google Drive','/Programmes/Nairobi Civic Tech/Evaluation/Final_Evaluation_Draft_v2.docx','pr5','evaluation_draft','Final Evaluation Report (draft v2)','p2','2026-06-26','Results: 41 datasets published against a target of 40. Monthly active users are 3,100 against a target of 5,000, down from a peak earlier in the year.

Sustainability: hosting is paid through July 2026. The governance board will explore adoption by the county government.

The draft does not identify a maintenance budget line and the recommendations do not include one.'),
('doc-005','Outlook','/Mailboxes/dkariuki/Inbox/RE_Drilling_rig_spares_supplier_contract','pr1','email_thread','RE: Drilling rig spares, supplier contract','p15','2026-06-27','From: Dennis Kariuki (Procurement Officer)
To: Amina Otieno
Subject: RE: Drilling rig spares, supplier contract

Amina, the request for drilling rig spares was raised on 20 June. We have three quotes and the preferred supplier is Lodwar Drilling Supplies Ltd, at about USD 86,000. They have not yet returned the signed contract. Anything above USD 75,000 needs Executive Director approval and it has not been routed yet.

Until the contract is signed the rig cannot be serviced. Please confirm whether you want me to escalate.'),
('doc-006','Outlook','/Mailboxes/jkamau/Inbox/Joseph_Mutua_contract','pr1','email_thread','Joseph Mutua consultancy contract expiry','p14','2026-06-29','From: Janet Kamau (HR Manager)
To: Amina Otieno
Subject: Joseph Mutua consultancy contract

Joseph Mutua''s consultancy ends on 17 July 2026. He is the named water systems consultant for both Turkana projects, Turkana Water Access and Turkana Pastoralist Resilience Fund. No renewal decision has been made. Contracting needs about two weeks, so a decision is needed this week to avoid a gap.'),
('doc-004','SharePoint','/sites/me/Audits/Q2_2026_Borehole_Functionality_Audit.docx','pr1','audit','Q2 2026 Borehole Functionality Audit','p2','2026-06-30','Of 112 boreholes audited across Turkana, 83% were functional, below the 90% target and down from 88% in Q1 2026. Non-functional boreholes are concentrated in Lokichar (7 boreholes) and Kalokol (5 boreholes), mostly pump failures.

Wards with an active water committee averaged 94% functionality, against 71% in wards without one.

Spare-part lead times are the main driver of repair delay. Average time to repair rose from 9 days to 17 days over the quarter.'),
('doc-007','Outlook','/Mailboxes/jkamau/Inbox/Senior_WASH_Engineer_vacancy','pr1','email_thread','Senior WASH Engineer vacancy status','p14','2026-06-30','From: Janet Kamau (HR Manager)
To: Amina Otieno
Subject: Senior WASH Engineer vacancy

The post was advertised on 1 June. There were 23 applicants and a shortlist of 6, but no candidate has reached final interview. Technical sign-off for the next drilling phase requires this role, and nobody has been assigned interim cover.

Phase 3b drilling is scheduled to start on 3 August. Samuel Kiptoo could provide interim technical sign-off if that is approved.'),
('doc-023','Google Drive','/HR/Memos/Recruitment_Status_June_2026.docx',NULL,'hr_memo','Recruitment status, June 2026','p14','2026-06-30','Three posts are open. Average time to fill is currently 52 days. The Senior WASH Engineer post was advertised on 1 June and is at shortlisting stage.'),
('doc-012','Outlook','/Mailboxes/pnjoroge/Inbox/Q3_report_reconciliation','pr4','email_thread','Q3 donor financial report reconciliation','p6','2026-07-01','From: Peter Njoroge (Finance Manager)
To: Mercy Wafula, Kevin Odhiambo
Subject: Q3 donor financial report reconciliation

The Nordic Development Partnership Q3 financial report is due on 15 July. We are reconciling three things at once: the Garissa variance, the Turkana procurement ledger and the Kilifi vendor payments. The Garissa variance is not yet fully explained. Please prioritise the Garissa work.');

-- data: docs.document_chunks
INSERT INTO docs.document_chunks (chunk_id,doc_id,chunk_index,project_id,text) VALUES
('doc-011#1','doc-011','1','pr9','The pilot showed the same pattern now visible in Garissa Maternal Health: 90% of the budget was spent by month 14 while only 58% of activities were complete.'),
('doc-011#2','doc-011','2','pr9','A no-cost extension was requested when the gap reached about 25 points and was approved. In 2022 a different donor refused a late request made after a budget freeze.'),
('doc-011#3','doc-011','3','pr9','Recommendation: request a no-cost extension as soon as the gap between budget used and activities delivered passes 20 percentage points. Do not wait for the donor to force the conversation.'),
('doc-001#1','doc-001','1','pr1','Drilling during the March to May 2024 long rains delayed Phase 1 borehole rehabilitation by about 6 weeks across Lokichar and Kalokol wards. Access roads washed out and rig mobilisation was blocked by standing water at several sites.'),
('doc-001#2','doc-001','2','pr1','Community water committees outperformed contractor-only maintenance by a wide margin. At 12 months, boreholes with an active committee were 91% functional, compared with 64% where maintenance was left to the contractor alone.'),
('doc-001#3','doc-001','3','pr1','The team pre-notified Global Resilience Fund in March 2024 that a slip was likely. The donor accepted a revised milestone date without penalty and the relationship was preserved.'),
('doc-001#4','doc-001','4','pr1','Recommendation: schedule drilling outside the long rains where possible, and pre-notify the donor at least 6 weeks ahead when a seasonal slip is expected.'),
('doc-123#1','doc-123','1','pr7','Notes from the team check-in. A 60-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-101#1','doc-101','1','pr3','Routine update for the period. Field teams completed scheduled visits and submitted data on time. Community feedback sessions were well attended. No issues were escalated this period.'),
('doc-146#1','doc-146','1','pr2','Routine update for the period. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-117#1','doc-117','1','pr6','Routine update for the period. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-107#1','doc-107','1','pr3','Notes from the team check-in. A 54-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-124#1','doc-124','1','pr7','Short progress note for the file. Travel request for a two-day field visit with 55 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-150#1','doc-150','1','pr5','Short progress note for the file. Travel request for a two-day field visit with 9 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-153#1','doc-153','1','pr6','Summary of this month''s activity. Travel request for a two-day field visit with 13 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-161#1','doc-161','1','pr2','Notes from the team check-in. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-103#1','doc-103','1','pr2','Logistics and coordination update. Travel request for a two-day field visit with 39 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-122#1','doc-122','1','pr3','Notes from the team check-in. Field teams completed scheduled visits and submitted data on time. Community feedback sessions were well attended. No issues were escalated this period.'),
('doc-156#1','doc-156','1','pr8','Routine update for the period. Short exchange confirming dates for the next partner meeting and venue arrangements. No decisions required.'),
('doc-002#1','doc-002','1','pr1','The long rains of 2025 again delayed drilling, this time by 8 weeks. The seasonal pattern first seen in Phase 1 repeated almost exactly, in the same wards.'),
('doc-002#2','doc-002','2','pr1','Unlike 2024, the team did not warn the donor in advance. Global Resilience Fund learned of the slip after the milestone date had passed. The Q2 review meeting was tense, and the donor asked for monthly progress reporting for the following two quarters.'),
('doc-002#3','doc-002','3','pr1','Three wards that relied on contractor-only maintenance had boreholes fail by month 9. Wards with active water committees did not show the same failures.'),
('doc-002#4','doc-002','4','pr1','Recommendation: treat the long-rains delay as a planning assumption, not an exception, and notify the donor early.'),
('doc-137#1','doc-137','1','pr7','Short progress note for the file. Travel request for a two-day field visit with 57 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-118#1','doc-118','1','pr1','Summary of this month''s activity. A 14-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-128#1','doc-128','1','pr5','Routine update for the period. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-104#1','doc-104','1','pr8','Short progress note for the file. Partners were updated on progress. Minor scheduling changes were agreed. 15 action points were recorded.'),
('doc-130#1','doc-130','1','pr6','Notes from the team check-in. A 10-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-148#1','doc-148','1','pr3','Logistics and coordination update. Short exchange confirming dates for the next partner meeting and venue arrangements. No decisions required.'),
('doc-021#1','doc-021','1',NULL,'Travel is approved by the Programme Manager for amounts below USD 2,000 and by the Finance Manager above that. Per diem rates are fixed by grade.'),
('doc-021#2','doc-021','2',NULL,'This version does not set a ceiling on travel spend per county or per project.'),
('doc-115#1','doc-115','1','pr6','Short progress note for the file. Training sessions ran as planned with 37 participants. Attendance registers are filed in the shared folder. Next round is scheduled for next month.'),
('doc-151#1','doc-151','1','pr5','Logistics and coordination update. A 60-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-152#1','doc-152','1','pr6','Notes from the team check-in. The team reviewed the workplan and confirmed responsibilities for the coming weeks. Action items were assigned and will be reviewed at the next meeting.'),
('doc-129#1','doc-129','1','pr3','Routine update for the period. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-111#1','doc-111','1','pr8','Notes from the team check-in. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-113#1','doc-113','1','pr1','Logistics and coordination update. Short exchange confirming dates for the next partner meeting and venue arrangements. No decisions required.'),
('doc-135#1','doc-135','1','pr3','Routine update for the period. Training sessions ran as planned with 18 participants. Attendance registers are filed in the shared folder. Next round is scheduled for next month.'),
('doc-155#1','doc-155','1','pr1','Routine update for the period. Travel request for a two-day field visit with 51 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-105#1','doc-105','1','pr6','Routine update for the period. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-120#1','doc-120','1','pr1','Summary of this month''s activity. Partners were updated on progress. Minor scheduling changes were agreed. 63 action points were recorded.'),
('doc-014#1','doc-014','1','pr5','Open data portals decay without recurring maintenance. Hosting, security patching and a part-time data steward need a dedicated maintenance budget line, otherwise usage drops within about 6 months of the grant ending.'),
('doc-014#2','doc-014','2','pr5','Recommendation: budget 8 to 10% of the build cost per year as a maintenance line, and include it in the closeout plan.'),
('doc-147#1','doc-147','1','pr3','Short progress note for the file. Travel request for a two-day field visit with 10 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-149#1','doc-149','1','pr1','Routine update for the period. Short exchange confirming dates for the next partner meeting and venue arrangements. No decisions required.'),
('doc-164#1','doc-164','1','pr2','Logistics and coordination update. The team reviewed the workplan and confirmed responsibilities for the coming weeks. Action items were assigned and will be reviewed at the next meeting.'),
('doc-114#1','doc-114','1','pr5','Summary of this month''s activity. Travel request for a two-day field visit with 44 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-126#1','doc-126','1','pr3','Logistics and coordination update. Partners were updated on progress. Minor scheduling changes were agreed. 35 action points were recorded.'),
('doc-154#1','doc-154','1','pr5','Notes from the team check-in. Training sessions ran as planned with 28 participants. Attendance registers are filed in the shared folder. Next round is scheduled for next month.'),
('doc-144#1','doc-144','1','pr6','Logistics and coordination update. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-110#1','doc-110','1','pr6','Logistics and coordination update. A 44-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-159#1','doc-159','1','pr5','Logistics and coordination update. Monitoring forms were collected from 35 sites. Enumerators reported good access. Data cleaning is under way.'),
('doc-127#1','doc-127','1','pr5','Notes from the team check-in. Partners were updated on progress. Minor scheduling changes were agreed. 29 action points were recorded.'),
('doc-108#1','doc-108','1','pr7','Summary of this month''s activity. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-138#1','doc-138','1','pr6','Logistics and coordination update. Travel request for a two-day field visit with 62 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-145#1','doc-145','1','pr2','Routine update for the period. Short exchange confirming dates for the next partner meeting and venue arrangements. No decisions required.'),
('doc-134#1','doc-134','1','pr2','Summary of this month''s activity. A 53-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-143#1','doc-143','1','pr1','Routine update for the period. Training sessions ran as planned with 27 participants. Attendance registers are filed in the shared folder. Next round is scheduled for next month.'),
('doc-158#1','doc-158','1','pr5','Short progress note for the file. Field teams completed scheduled visits and submitted data on time. Community feedback sessions were well attended. No issues were escalated this period.'),
('doc-112#1','doc-112','1','pr1','Notes from the team check-in. A 16-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.');
INSERT INTO docs.document_chunks (chunk_id,doc_id,chunk_index,project_id,text) VALUES
('doc-163#1','doc-163','1','pr5','Notes from the team check-in. A 44-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-160#1','doc-160','1','pr1','Notes from the team check-in. The team reviewed the workplan and confirmed responsibilities for the coming weeks. Action items were assigned and will be reviewed at the next meeting.'),
('doc-125#1','doc-125','1','pr7','Summary of this month''s activity. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-162#1','doc-162','1','pr6','Logistics and coordination update. Travel request for a two-day field visit with 28 staff. Estimated cost is within the approved project budget. Approved by the Programme Manager.'),
('doc-017#1','doc-017','1','pr2','Twelve-month business survival rose from a baseline of 54% to 79%. Peer mentorship circles were the strongest single lever.'),
('doc-017#2','doc-017','2','pr2','Releasing grants against savings-group milestones, rather than loan terms alone, nearly eliminated default: 3.1% against 14% where grants were not linked to milestones.'),
('doc-017#3','doc-017','3','pr2','Women who completed financial literacy training were 2.3 times more likely to reinvest profit into the business.'),
('doc-106#1','doc-106','1','pr4','Summary of this month''s activity. Field teams completed scheduled visits and submitted data on time. Community feedback sessions were well attended. No issues were escalated this period.'),
('doc-109#1','doc-109','1','pr7','Notes from the team check-in. Field teams completed scheduled visits and submitted data on time. Community feedback sessions were well attended. No issues were escalated this period.'),
('doc-133#1','doc-133','1','pr3','Routine update for the period. A 14-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-132#1','doc-132','1','pr6','Logistics and coordination update. Partners were updated on progress. Minor scheduling changes were agreed. 45 action points were recorded.'),
('doc-119#1','doc-119','1','pr1','Short progress note for the file. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-018#1','doc-018','1','pr2','Savings groups with a trained mentor met more consistently and had fewer withdrawals in the first year.'),
('doc-018#2','doc-018','2','pr2','In pastoralist settings the structure of the credit product mattered as much as the training. Conventional interest-bearing products were refused by about 90% of applicants, while Sharia-compliant credit saw strong uptake.'),
('doc-018#3','doc-018','3','pr2','Mentor circles should be established before any credit is disbursed.'),
('doc-139#1','doc-139','1','pr3','Short progress note for the file. Partners were updated on progress. Minor scheduling changes were agreed. 14 action points were recorded.'),
('doc-013#1','doc-013','1','pr4','Stock-outs of antenatal consumables caused four mobile clinic days to be cancelled in Fafi during April and May. Attendance fell and mothers were redirected to a facility 40 km away.'),
('doc-013#2','doc-013','2','pr4','Restocking was delayed by supplier issues. Vehicle hire and fuel costs continued to be incurred on the cancelled days.'),
('doc-157#1','doc-157','1','pr6','Logistics and coordination update. A 48-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-025#1','doc-025','1','pr3','Heavy rain left standing water in the training centre compound. Classes were moved to a partner venue for four days. No equipment was damaged.'),
('doc-136#1','doc-136','1','pr2','Summary of this month''s activity. Partners were updated on progress. Minor scheduling changes were agreed. 61 action points were recorded.'),
('doc-022#1','doc-022','1',NULL,'Proposes that purchases above USD 75,000 require Executive Director approval, with a target turnaround of 10 working days.'),
('doc-022#2','doc-022','2',NULL,'The draft does not yet include an escalation rule for supplier contracts that remain unsigned for more than 14 days.'),
('doc-140#1','doc-140','1','pr7','Logistics and coordination update. A 54-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-121#1','doc-121','1','pr7','Notes from the team check-in. Partners were updated on progress. Minor scheduling changes were agreed. 40 action points were recorded.'),
('doc-141#1','doc-141','1','pr8','Summary of this month''s activity. Field teams completed scheduled visits and submitted data on time. Community feedback sessions were well attended. No issues were escalated this period.'),
('doc-016#1','doc-016','1','pr5','Attendees: David Mwangi, Peter Njoroge, Christopher Mbugua and the EU Devolution Facility programme officer.'),
('doc-016#2','doc-016','2','pr5','The EU asked about sustainability after grant end. County government interest was noted, but no funds are committed.'),
('doc-016#3','doc-016','3','pr5','The EU stated that the closeout report due on 31 July must contain a sustainability plan with a costed budget.'),
('doc-019#1','doc-019','1','pr8','Cooperative disputes rose to 6 in Q2 from 4 in Q1, after falling from 11 in Q3 2025. Leadership training delivered in Q4 2025 reduced disputes, but no refresher has been scheduled.'),
('doc-019#2','doc-019','2','pr8','The Garissa cooperative programme has no peer mentorship structure, unlike the Kisumu programme. Sharia-compliant products continue to see strong uptake.'),
('doc-116#1','doc-116','1','pr5','Notes from the team check-in. Training sessions ran as planned with 15 participants. Attendance registers are filed in the shared folder. Next round is scheduled for next month.'),
('doc-024#1','doc-024','1','pr6','All eleven water points visited in Kakuma ward were functioning. Equipment is available and no delays are expected for the Pastoralist Resilience programme in this ward.'),
('doc-142#1','doc-142','1','pr7','Short progress note for the file. Confirmation of vendor invoice receipt and routine payment processing. Nothing outstanding.'),
('doc-008#1','doc-008','1','pr1','The programme officer asked how confident we are in the Q3 milestone: all 14 wards drilled or rehabilitated by 30 September 2026.'),
('doc-008#2','doc-008','2','pr1','She reminded us that after the 2025 delay they expect early warning of any slip. Next check-in is scheduled for 20 July 2026.'),
('doc-008#3','doc-008','3','pr1','No commitments were made on the call about the date.'),
('doc-009#1','doc-009','1','pr4','Garissa Maternal Health Outreach has spent 93% of its USD 540,000 budget, against 61% of planned activities completed. USD 37,800 remains.'),
('doc-009#2','doc-009','2','pr4','The travel line is at 125% of its budget, driven by fuel and vehicle hire for mobile clinic rounds to Dadaab and Ijara. Personnel is at 99%. The works and equipment line is at 76%.'),
('doc-009#3','doc-009','3','pr4','At the current rate of spending the remaining budget will be exhausted before the second round of outreach clinics is complete. This has been flagged to the Executive Director.'),
('doc-131#1','doc-131','1','pr5','Summary of this month''s activity. A 29-person training was delivered on schedule. Participants rated the content highly. Materials are archived for reuse.'),
('doc-010#1','doc-010','1','pr4','Attendees: Peter Njoroge, Fatuma Hassan, Halima Abdi, Mercy Wafula.'),
('doc-010#2','doc-010','2','pr4','The group agreed to propose moving USD 18,000 from the M&E and Training lines to the travel line, subject to donor approval. This brings available funds to about USD 55,800.'),
('doc-010#3','doc-010','3','pr4','Remaining activities cost an estimated USD 41,000 if delivered through a community health worker led model rather than mobile clinics. That is feasible only with an extension of the grant period to 31 December 2026, because the current end date is 30 September.'),
('doc-010#4','doc-010','4','pr4','No decision was taken. The extension request and reallocation are waiting for the Executive Director.'),
('doc-102#1','doc-102','1','pr6','Routine update for the period. The team reviewed the workplan and confirmed responsibilities for the coming weeks. Action items were assigned and will be reviewed at the next meeting.'),
('doc-003#1','doc-003','1','pr1','Visited five Phase 3 drilling sites in Lokichar ward. Standing water was present at three of the five sites (LK-03, LK-04, LK-05). The rig could not mobilise to any of the three. Photographs IMG_2201 to IMG_2214 are attached to the site folder.'),
('doc-003#2','doc-003','2','pr1','The access road to LK-04 is impassable. Rains have continued later than usual this season. If they persist, I estimate 5 to 6 weeks before the ground is dry enough to drill.'),
('doc-003#3','doc-003','3','pr1','Two sites (LK-01, LK-02) are workable, but the rig spares requested on 20 June are still outstanding and drilling cannot restart without them.'),
('doc-003#4','doc-003','4','pr1','Recommend informing Global Resilience Fund now of a likely slip of around 6 weeks.'),
('doc-020#1','doc-020','1',NULL,'Organisation-wide travel spend rose 11% in Q2 2026 compared with Q1 2026. The travel policy has no per-county ceiling.'),
('doc-020#2','doc-020','2',NULL,'Two projects are running above their planned burn rate: Turkana Water Access and Garissa Maternal Health Outreach. Other projects are at or below plan.'),
('doc-020#3','doc-020','3',NULL,'A procurement policy update is in progress, with adoption targeted for the September board meeting.'),
('doc-015#1','doc-015','1','pr5','Results: 41 datasets published against a target of 40. Monthly active users are 3,100 against a target of 5,000, down from a peak earlier in the year.'),
('doc-015#2','doc-015','2','pr5','Sustainability: hosting is paid through July 2026. The governance board will explore adoption by the county government.'),
('doc-015#3','doc-015','3','pr5','The draft does not identify a maintenance budget line and the recommendations do not include one.'),
('doc-005#1','doc-005','1','pr1','From: Dennis Kariuki (Procurement Officer)
To: Amina Otieno
Subject: RE: Drilling rig spares, supplier contract'),
('doc-005#2','doc-005','2','pr1','Amina, the request for drilling rig spares was raised on 20 June. We have three quotes and the preferred supplier is Lodwar Drilling Supplies Ltd, at about USD 86,000. They have not yet returned the signed contract. Anything above USD 75,000 needs Executive Director approval and it has not been routed yet.'),
('doc-005#3','doc-005','3','pr1','Until the contract is signed the rig cannot be serviced. Please confirm whether you want me to escalate.'),
('doc-006#1','doc-006','1','pr1','From: Janet Kamau (HR Manager)
To: Amina Otieno
Subject: Joseph Mutua consultancy contract');
INSERT INTO docs.document_chunks (chunk_id,doc_id,chunk_index,project_id,text) VALUES
('doc-006#2','doc-006','2','pr1','Joseph Mutua''s consultancy ends on 17 July 2026. He is the named water systems consultant for both Turkana projects, Turkana Water Access and Turkana Pastoralist Resilience Fund. No renewal decision has been made. Contracting needs about two weeks, so a decision is needed this week to avoid a gap.'),
('doc-004#1','doc-004','1','pr1','Of 112 boreholes audited across Turkana, 83% were functional, below the 90% target and down from 88% in Q1 2026. Non-functional boreholes are concentrated in Lokichar (7 boreholes) and Kalokol (5 boreholes), mostly pump failures.'),
('doc-004#2','doc-004','2','pr1','Wards with an active water committee averaged 94% functionality, against 71% in wards without one.'),
('doc-004#3','doc-004','3','pr1','Spare-part lead times are the main driver of repair delay. Average time to repair rose from 9 days to 17 days over the quarter.'),
('doc-007#1','doc-007','1','pr1','From: Janet Kamau (HR Manager)
To: Amina Otieno
Subject: Senior WASH Engineer vacancy'),
('doc-007#2','doc-007','2','pr1','The post was advertised on 1 June. There were 23 applicants and a shortlist of 6, but no candidate has reached final interview. Technical sign-off for the next drilling phase requires this role, and nobody has been assigned interim cover.'),
('doc-007#3','doc-007','3','pr1','Phase 3b drilling is scheduled to start on 3 August. Samuel Kiptoo could provide interim technical sign-off if that is approved.'),
('doc-023#1','doc-023','1',NULL,'Three posts are open. Average time to fill is currently 52 days. The Senior WASH Engineer post was advertised on 1 June and is at shortlisting stage.'),
('doc-012#1','doc-012','1','pr4','From: Peter Njoroge (Finance Manager)
To: Mercy Wafula, Kevin Odhiambo
Subject: Q3 donor financial report reconciliation'),
('doc-012#2','doc-012','2','pr4','The Nordic Development Partnership Q3 financial report is due on 15 July. We are reconciling three things at once: the Garissa variance, the Turkana procurement ledger and the Kilifi vendor payments. The Garissa variance is not yet fully explained. Please prioritise the Garissa work.');

-- data: kobo.kpi_definitions
INSERT INTO kobo.kpi_definitions (kpi_id,project_id,name,unit,target,direction,frequency,is_cumulative,form_id) VALUES
('K1','pr1','Functional boreholes','%','90','higher_better','monthly','False','borehole_audit'),
('K2','pr1','People with safe water within 2 km','people','120000','higher_better','monthly','True','household_access'),
('K10','pr1','Active water committees','committees','28','higher_better','monthly','True','committee_register'),
('K3','pr2','12-month business survival','%','70','higher_better','quarterly','False','business_followup'),
('K11','pr2','Women reinvesting profit','%','60','higher_better','quarterly','False','business_followup'),
('K4','pr3','Youth placed in jobs','youth','600','higher_better','monthly','True','placement_tracker'),
('K7','pr4','Maternal clinic attendance','visits/month','1800','higher_better','monthly','False','clinic_register'),
('K12','pr4','Skilled birth attendance','%','75','higher_better','quarterly','False','clinic_register'),
('K13','pr5','Open datasets published','datasets','40','higher_better','monthly','True','portal_stats'),
('K6','pr5','Portal monthly active users','users','5000','higher_better','monthly','False','portal_stats'),
('K5','pr6','Livestock vaccination coverage','%','75','higher_better','quarterly','False','vaccination_campaign'),
('K9','pr7','Youth trained in digital skills','youth','500','higher_better','monthly','True','training_register'),
('K8','pr8','Cooperative disputes per quarter','disputes','6','lower_better','quarterly','False','cooperative_check');

-- data: kobo.kobo_submissions
INSERT INTO kobo.kobo_submissions (submission_id,form_id,kpi_id,project_id,county,ward,period_month,value,sample_size,enumerator,submitted_at,status) VALUES
('sub-000001','borehole_audit','K1','pr1','Turkana','ALL','2025-01-01','86',NULL,'ENUM-02','2025-02-09','approved'),
('sub-000002','borehole_audit','K1','pr1','Turkana','ALL','2025-02-01','86',NULL,'ENUM-02','2025-03-07','approved'),
('sub-000003','borehole_audit','K1','pr1','Turkana','ALL','2025-03-01','87',NULL,'ENUM-04','2025-04-09','approved'),
('sub-000004','borehole_audit','K1','pr1','Turkana','ALL','2025-04-01','87',NULL,'ENUM-04','2025-05-03','approved'),
('sub-000005','borehole_audit','K1','pr1','Turkana','ALL','2025-05-01','88',NULL,'ENUM-03','2025-06-03','approved'),
('sub-000006','borehole_audit','K1','pr1','Turkana','ALL','2025-06-01','88',NULL,'ENUM-01','2025-07-07','approved'),
('sub-000007','borehole_audit','K1','pr1','Turkana','ALL','2025-07-01','88',NULL,'ENUM-04','2025-08-04','approved'),
('sub-000008','borehole_audit','K1','pr1','Turkana','ALL','2025-08-01','87',NULL,'ENUM-02','2025-09-07','approved'),
('sub-000009','borehole_audit','K1','pr1','Turkana','ALL','2025-09-01','87',NULL,'ENUM-01','2025-10-08','approved'),
('sub-000010','borehole_audit','K1','pr1','Turkana','ALL','2025-10-01','88',NULL,'ENUM-04','2025-11-07','approved'),
('sub-000011','borehole_audit','K1','pr1','Turkana','ALL','2025-11-01','88',NULL,'ENUM-02','2025-12-03','approved'),
('sub-000012','borehole_audit','K1','pr1','Turkana','ALL','2025-12-01','88',NULL,'ENUM-02','2026-01-05','approved'),
('sub-000013','borehole_audit','K1','pr1','Turkana','ALL','2026-01-01','88',NULL,'ENUM-04','2026-02-03','approved'),
('sub-000014','borehole_audit','K1','pr1','Turkana','ALL','2026-02-01','88',NULL,'ENUM-04','2026-03-06','approved'),
('sub-000015','borehole_audit','K1','pr1','Turkana','ALL','2026-03-01','88',NULL,'ENUM-03','2026-04-04','approved'),
('sub-000016','borehole_audit','K1','pr1','Turkana','ALL','2026-04-01','86',NULL,'ENUM-01','2026-05-06','approved'),
('sub-000017','borehole_audit','K1','pr1','Turkana','ALL','2026-05-01','84',NULL,'ENUM-02','2026-06-10','approved'),
('sub-000018','borehole_audit','K1','pr1','Turkana','ALL','2026-06-01','83',NULL,'ENUM-01','2026-07-05','approved'),
('sub-000019','borehole_audit','K1','pr1','Turkana','Lokichar','2025-01-01','83.2','18','ENUM-02','2025-02-05','approved'),
('sub-000020','borehole_audit','K1','pr1','Turkana','Lokichar','2025-02-01','84.2','23','ENUM-04','2025-03-09','approved'),
('sub-000021','borehole_audit','K1','pr1','Turkana','Lokichar','2025-03-01','84.2','17','ENUM-04','2025-04-07','approved'),
('sub-000022','borehole_audit','K1','pr1','Turkana','Lokichar','2025-04-01','83.6','21','ENUM-01','2025-05-08','approved'),
('sub-000023','borehole_audit','K1','pr1','Turkana','Lokichar','2025-05-01','85.3','19','ENUM-03','2025-06-07','approved'),
('sub-000024','borehole_audit','K1','pr1','Turkana','Lokichar','2025-06-01','84.3','15','ENUM-03','2025-07-03','approved'),
('sub-000025','borehole_audit','K1','pr1','Turkana','Lokichar','2025-07-01','85.3','23','ENUM-02','2025-08-05','approved'),
('sub-000026','borehole_audit','K1','pr1','Turkana','Lokichar','2025-08-01','83.8','15','ENUM-01','2025-09-06','approved'),
('sub-000027','borehole_audit','K1','pr1','Turkana','Lokichar','2025-09-01','85.1','21','ENUM-01','2025-10-03','approved'),
('sub-000028','borehole_audit','K1','pr1','Turkana','Lokichar','2025-10-01','86.0','19','ENUM-04','2025-11-07','approved'),
('sub-000029','borehole_audit','K1','pr1','Turkana','Lokichar','2025-11-01','86.0','21','ENUM-01','2025-12-09','approved'),
('sub-000030','borehole_audit','K1','pr1','Turkana','Lokichar','2025-12-01','85.6','22','ENUM-02','2026-01-04','approved'),
('sub-000031','borehole_audit','K1','pr1','Turkana','Lokichar','2026-01-01','84.8','24','ENUM-03','2026-02-03','approved'),
('sub-000032','borehole_audit','K1','pr1','Turkana','Lokichar','2026-02-01','85.5','17','ENUM-03','2026-03-05','approved'),
('sub-000033','borehole_audit','K1','pr1','Turkana','Lokichar','2026-03-01','79.8','14','ENUM-03','2026-04-03','approved'),
('sub-000034','borehole_audit','K1','pr1','Turkana','Lokichar','2026-04-01','77.8','18','ENUM-01','2026-05-10','approved'),
('sub-000035','borehole_audit','K1','pr1','Turkana','Lokichar','2026-05-01','75.3','17','ENUM-03','2026-06-05','approved'),
('sub-000036','borehole_audit','K1','pr1','Turkana','Lokichar','2026-06-01','74.1','25','ENUM-03','2026-07-09','approved'),
('sub-000037','borehole_audit','K1','pr1','Turkana','Kalokol','2025-01-01','83.6','16','ENUM-01','2025-02-05','approved'),
('sub-000038','borehole_audit','K1','pr1','Turkana','Kalokol','2025-02-01','84.1','26','ENUM-04','2025-03-05','approved'),
('sub-000039','borehole_audit','K1','pr1','Turkana','Kalokol','2025-03-01','85.1','21','ENUM-01','2025-04-04','approved'),
('sub-000040','borehole_audit','K1','pr1','Turkana','Kalokol','2025-04-01','84.4','21','ENUM-03','2025-05-07','approved'),
('sub-000041','borehole_audit','K1','pr1','Turkana','Kalokol','2025-05-01','86.0','19','ENUM-01','2025-06-05','approved'),
('sub-000042','borehole_audit','K1','pr1','Turkana','Kalokol','2025-06-01','86.6','23','ENUM-02','2025-07-08','approved'),
('sub-000043','borehole_audit','K1','pr1','Turkana','Kalokol','2025-07-01','86.6','23','ENUM-01','2025-08-04','approved'),
('sub-000044','borehole_audit','K1','pr1','Turkana','Kalokol','2025-08-01','85.1','20','ENUM-02','2025-09-04','approved'),
('sub-000045','borehole_audit','K1','pr1','Turkana','Kalokol','2025-09-01','85.2','15','ENUM-03','2025-10-08','approved'),
('sub-000046','borehole_audit','K1','pr1','Turkana','Kalokol','2025-10-01','85.7','25','ENUM-04','2025-11-03','approved'),
('sub-000047','borehole_audit','K1','pr1','Turkana','Kalokol','2025-11-01','86.7','14','ENUM-02','2025-12-05','approved'),
('sub-000048','borehole_audit','K1','pr1','Turkana','Kalokol','2025-12-01','86.8','25','ENUM-02','2026-01-06','approved'),
('sub-000049','borehole_audit','K1','pr1','Turkana','Kalokol','2026-01-01','85.6','25','ENUM-03','2026-02-08','approved'),
('sub-000050','borehole_audit','K1','pr1','Turkana','Kalokol','2026-02-01','87.0','19','ENUM-01','2026-03-08','approved'),
('sub-000051','borehole_audit','K1','pr1','Turkana','Kalokol','2026-03-01','81.5','25','ENUM-03','2026-04-07','approved'),
('sub-000052','borehole_audit','K1','pr1','Turkana','Kalokol','2026-04-01','79.3','17','ENUM-01','2026-05-05','approved'),
('sub-000053','borehole_audit','K1','pr1','Turkana','Kalokol','2026-05-01','77.0','25','ENUM-03','2026-06-04','approved'),
('sub-000054','borehole_audit','K1','pr1','Turkana','Kalokol','2026-06-01','76.3','18','ENUM-02','2026-07-05','approved'),
('sub-000055','borehole_audit','K1','pr1','Turkana','Lodwar Township','2025-01-01','87.6','26','ENUM-03','2025-02-07','approved'),
('sub-000056','borehole_audit','K1','pr1','Turkana','Lodwar Township','2025-02-01','86.8','20','ENUM-03','2025-03-06','approved'),
('sub-000057','borehole_audit','K1','pr1','Turkana','Lodwar Township','2025-03-01','88.9','17','ENUM-02','2025-04-06','approved'),
('sub-000058','borehole_audit','K1','pr1','Turkana','Lodwar Township','2025-04-01','88.5','25','ENUM-02','2025-05-06','approved'),
('sub-000059','borehole_audit','K1','pr1','Turkana','Lodwar Township','2025-05-01','89.2','18','ENUM-03','2025-06-03','approved'),
('sub-000060','borehole_audit','K1','pr1','Turkana','Lodwar Township','2025-06-01','89.9','16','ENUM-02','2025-07-05','approved');
INSERT INTO kobo.kobo_submissions (submission_id,form_id,kpi_id,project_id,county,ward,period_month,value,sample_size,enumerator,submitted_at,status) VALUES
('sub-000061','borehole_audit','K1','pr1','Turkana','Lodwar Township','2025-07-01','88.5','22','ENUM-03','2025-08-03','approved'),
('sub-000062','borehole_audit','K1','pr1','Turkana','Lodwar Township','2025-08-01','88.1','24','ENUM-02','2025-09-03','approved'),
('sub-000063','borehole_audit','K1','pr1','Turkana','Lodwar Township','2025-09-01','87.7','20','ENUM-03','2025-10-05','approved'),
('sub-000064','borehole_audit','K1','pr1','Turkana','Lodwar Township','2025-10-01','88.7','14','ENUM-02','2025-11-08','approved'),
('sub-000065','borehole_audit','K1','pr1','Turkana','Lodwar Township','2025-11-01','89.3','26','ENUM-03','2025-12-08','approved'),
('sub-000066','borehole_audit','K1','pr1','Turkana','Lodwar Township','2025-12-01','89.6','21','ENUM-01','2026-01-07','approved'),
('sub-000067','borehole_audit','K1','pr1','Turkana','Lodwar Township','2026-01-01','88.9','17','ENUM-02','2026-02-06','approved'),
('sub-000068','borehole_audit','K1','pr1','Turkana','Lodwar Township','2026-02-01','89.4','26','ENUM-01','2026-03-07','approved'),
('sub-000069','borehole_audit','K1','pr1','Turkana','Lodwar Township','2026-03-01','91.2','20','ENUM-03','2026-04-07','approved'),
('sub-000070','borehole_audit','K1','pr1','Turkana','Lodwar Township','2026-04-01','89.1','17','ENUM-02','2026-05-03','approved'),
('sub-000071','borehole_audit','K1','pr1','Turkana','Lodwar Township','2026-05-01','87.9','19','ENUM-02','2026-06-09','approved'),
('sub-000072','borehole_audit','K1','pr1','Turkana','Lodwar Township','2026-06-01','86.5','14','ENUM-03','2026-07-09','approved'),
('sub-000073','borehole_audit','K1','pr1','Turkana','Kakuma','2025-01-01','87.7','15','ENUM-04','2025-02-07','approved'),
('sub-000074','borehole_audit','K1','pr1','Turkana','Kakuma','2025-02-01','86.0','18','ENUM-01','2025-03-07','approved'),
('sub-000075','borehole_audit','K1','pr1','Turkana','Kakuma','2025-03-01','87.7','20','ENUM-03','2025-04-07','approved'),
('sub-000076','borehole_audit','K1','pr1','Turkana','Kakuma','2025-04-01','87.2','22','ENUM-01','2025-05-10','approved'),
('sub-000077','borehole_audit','K1','pr1','Turkana','Kakuma','2025-05-01','88.3','17','ENUM-01','2025-06-09','approved'),
('sub-000078','borehole_audit','K1','pr1','Turkana','Kakuma','2025-06-01','89.4','26','ENUM-04','2025-07-08','approved'),
('sub-000079','borehole_audit','K1','pr1','Turkana','Kakuma','2025-07-01','89.1','15','ENUM-03','2025-08-03','approved'),
('sub-000080','borehole_audit','K1','pr1','Turkana','Kakuma','2025-08-01','88.2','20','ENUM-01','2025-09-05','approved'),
('sub-000081','borehole_audit','K1','pr1','Turkana','Kakuma','2025-09-01','87.1','17','ENUM-02','2025-10-04','approved'),
('sub-000082','borehole_audit','K1','pr1','Turkana','Kakuma','2025-10-01','88.0','18','ENUM-03','2025-11-07','approved'),
('sub-000083','borehole_audit','K1','pr1','Turkana','Kakuma','2025-11-01','89.1','18','ENUM-03','2025-12-10','approved'),
('sub-000084','borehole_audit','K1','pr1','Turkana','Kakuma','2025-12-01','88.1','15','ENUM-04','2026-01-07','approved'),
('sub-000085','borehole_audit','K1','pr1','Turkana','Kakuma','2026-01-01','88.8','17','ENUM-02','2026-02-03','approved'),
('sub-000086','borehole_audit','K1','pr1','Turkana','Kakuma','2026-02-01','89.5','20','ENUM-03','2026-03-06','approved'),
('sub-000087','borehole_audit','K1','pr1','Turkana','Kakuma','2026-03-01','90.3','25','ENUM-03','2026-04-07','approved'),
('sub-000088','borehole_audit','K1','pr1','Turkana','Kakuma','2026-04-01','88.5','19','ENUM-02','2026-05-10','approved'),
('sub-000089','borehole_audit','K1','pr1','Turkana','Kakuma','2026-05-01','86.0','14','ENUM-01','2026-06-09','approved'),
('sub-000090','borehole_audit','K1','pr1','Turkana','Kakuma','2026-06-01','85.3','14','ENUM-01','2026-07-06','approved'),
('sub-000091','borehole_audit','K1','pr1','Turkana','Turkwel','2025-01-01','86.4','15','ENUM-03','2025-02-04','approved'),
('sub-000092','borehole_audit','K1','pr1','Turkana','Turkwel','2025-02-01','85.6','17','ENUM-02','2025-03-08','approved'),
('sub-000093','borehole_audit','K1','pr1','Turkana','Turkwel','2025-03-01','88.0','15','ENUM-04','2025-04-06','approved'),
('sub-000094','borehole_audit','K1','pr1','Turkana','Turkwel','2025-04-01','87.6','20','ENUM-02','2025-05-06','approved'),
('sub-000095','borehole_audit','K1','pr1','Turkana','Turkwel','2025-05-01','89.3','26','ENUM-04','2025-06-10','approved'),
('sub-000096','borehole_audit','K1','pr1','Turkana','Turkwel','2025-06-01','89.1','20','ENUM-03','2025-07-03','approved'),
('sub-000097','borehole_audit','K1','pr1','Turkana','Turkwel','2025-07-01','88.2','20','ENUM-01','2025-08-06','approved'),
('sub-000098','borehole_audit','K1','pr1','Turkana','Turkwel','2025-08-01','88.1','16','ENUM-01','2025-09-10','approved'),
('sub-000099','borehole_audit','K1','pr1','Turkana','Turkwel','2025-09-01','88.0','24','ENUM-03','2025-10-04','approved'),
('sub-000100','borehole_audit','K1','pr1','Turkana','Turkwel','2025-10-01','88.6','19','ENUM-03','2025-11-10','approved'),
('sub-000101','borehole_audit','K1','pr1','Turkana','Turkwel','2025-11-01','87.6','19','ENUM-03','2025-12-10','approved'),
('sub-000102','borehole_audit','K1','pr1','Turkana','Turkwel','2025-12-01','88.1','24','ENUM-04','2026-01-10','approved'),
('sub-000103','borehole_audit','K1','pr1','Turkana','Turkwel','2026-01-01','88.2','26','ENUM-02','2026-02-07','approved'),
('sub-000104','borehole_audit','K1','pr1','Turkana','Turkwel','2026-02-01','89.2','18','ENUM-01','2026-03-03','approved'),
('sub-000105','borehole_audit','K1','pr1','Turkana','Turkwel','2026-03-01','88.3','17','ENUM-02','2026-04-08','approved'),
('sub-000106','borehole_audit','K1','pr1','Turkana','Turkwel','2026-04-01','87.5','25','ENUM-01','2026-05-09','approved'),
('sub-000107','borehole_audit','K1','pr1','Turkana','Turkwel','2026-05-01','84.5','19','ENUM-03','2026-06-07','approved'),
('sub-000108','borehole_audit','K1','pr1','Turkana','Turkwel','2026-06-01','83.8','18','ENUM-02','2026-07-06','approved'),
('sub-000109','borehole_audit','K1','pr1','Turkana','Lorugum','2025-01-01','86.4','23','ENUM-03','2025-02-06','approved'),
('sub-000110','borehole_audit','K1','pr1','Turkana','Lorugum','2025-02-01','85.9','17','ENUM-01','2025-03-07','approved'),
('sub-000111','borehole_audit','K1','pr1','Turkana','Lorugum','2025-03-01','86.6','18','ENUM-01','2025-04-10','approved'),
('sub-000112','borehole_audit','K1','pr1','Turkana','Lorugum','2025-04-01','85.9','19','ENUM-04','2025-05-05','approved'),
('sub-000113','borehole_audit','K1','pr1','Turkana','Lorugum','2025-05-01','86.4','21','ENUM-01','2025-06-03','approved'),
('sub-000114','borehole_audit','K1','pr1','Turkana','Lorugum','2025-06-01','86.5','17','ENUM-04','2025-07-05','approved'),
('sub-000115','borehole_audit','K1','pr1','Turkana','Lorugum','2025-07-01','87.4','17','ENUM-01','2025-08-07','approved'),
('sub-000116','borehole_audit','K1','pr1','Turkana','Lorugum','2025-08-01','86.2','26','ENUM-01','2025-09-09','approved'),
('sub-000117','borehole_audit','K1','pr1','Turkana','Lorugum','2025-09-01','86.2','18','ENUM-01','2025-10-08','approved'),
('sub-000118','borehole_audit','K1','pr1','Turkana','Lorugum','2025-10-01','87.1','26','ENUM-02','2025-11-09','approved'),
('sub-000119','borehole_audit','K1','pr1','Turkana','Lorugum','2025-11-01','88.0','25','ENUM-02','2025-12-08','approved'),
('sub-000120','borehole_audit','K1','pr1','Turkana','Lorugum','2025-12-01','87.0','16','ENUM-04','2026-01-07','approved');
INSERT INTO kobo.kobo_submissions (submission_id,form_id,kpi_id,project_id,county,ward,period_month,value,sample_size,enumerator,submitted_at,status) VALUES
('sub-000121','borehole_audit','K1','pr1','Turkana','Lorugum','2026-01-01','86.5','22','ENUM-04','2026-02-05','approved'),
('sub-000122','borehole_audit','K1','pr1','Turkana','Lorugum','2026-02-01','88.1','24','ENUM-03','2026-03-07','approved'),
('sub-000123','borehole_audit','K1','pr1','Turkana','Lorugum','2026-03-01','85.9','21','ENUM-01','2026-04-05','approved'),
('sub-000124','borehole_audit','K1','pr1','Turkana','Lorugum','2026-04-01','84.3','24','ENUM-03','2026-05-09','approved'),
('sub-000125','borehole_audit','K1','pr1','Turkana','Lorugum','2026-05-01','82.9','16','ENUM-02','2026-06-04','approved'),
('sub-000126','borehole_audit','K1','pr1','Turkana','Lorugum','2026-06-01','80.1','16','ENUM-03','2026-07-08','approved'),
('sub-000127','household_access','K2','pr1','Turkana','ALL','2025-01-01','52000',NULL,'ENUM-01','2025-02-03','approved'),
('sub-000128','household_access','K2','pr1','Turkana','ALL','2025-02-01','54612',NULL,'ENUM-02','2025-03-06','approved'),
('sub-000129','household_access','K2','pr1','Turkana','ALL','2025-03-01','57224',NULL,'ENUM-02','2025-04-08','approved'),
('sub-000130','household_access','K2','pr1','Turkana','ALL','2025-04-01','59835',NULL,'ENUM-03','2025-05-06','approved'),
('sub-000131','household_access','K2','pr1','Turkana','ALL','2025-05-01','62447',NULL,'ENUM-03','2025-06-07','approved'),
('sub-000132','household_access','K2','pr1','Turkana','ALL','2025-06-01','65059',NULL,'ENUM-01','2025-07-07','approved'),
('sub-000133','household_access','K2','pr1','Turkana','ALL','2025-07-01','67671',NULL,'ENUM-04','2025-08-08','approved'),
('sub-000134','household_access','K2','pr1','Turkana','ALL','2025-08-01','70282',NULL,'ENUM-02','2025-09-08','approved'),
('sub-000135','household_access','K2','pr1','Turkana','ALL','2025-09-01','72894',NULL,'ENUM-02','2025-10-05','approved'),
('sub-000136','household_access','K2','pr1','Turkana','ALL','2025-10-01','75506',NULL,'ENUM-03','2025-11-06','approved'),
('sub-000137','household_access','K2','pr1','Turkana','ALL','2025-11-01','78118',NULL,'ENUM-04','2025-12-06','approved'),
('sub-000138','household_access','K2','pr1','Turkana','ALL','2025-12-01','80729',NULL,'ENUM-01','2026-01-07','approved'),
('sub-000139','household_access','K2','pr1','Turkana','ALL','2026-01-01','83341',NULL,'ENUM-04','2026-02-09','approved'),
('sub-000140','household_access','K2','pr1','Turkana','ALL','2026-02-01','85953',NULL,'ENUM-03','2026-03-05','approved'),
('sub-000141','household_access','K2','pr1','Turkana','ALL','2026-03-01','88565',NULL,'ENUM-03','2026-04-04','approved'),
('sub-000142','household_access','K2','pr1','Turkana','ALL','2026-04-01','91176',NULL,'ENUM-03','2026-05-04','approved'),
('sub-000143','household_access','K2','pr1','Turkana','ALL','2026-05-01','93788',NULL,'ENUM-01','2026-06-03','approved'),
('sub-000144','household_access','K2','pr1','Turkana','ALL','2026-06-01','96400',NULL,'ENUM-04','2026-07-06','approved'),
('sub-000145','committee_register','K10','pr1','Turkana','ALL','2025-01-01','19',NULL,'ENUM-04','2025-02-10','approved'),
('sub-000146','committee_register','K10','pr1','Turkana','ALL','2025-02-01','19',NULL,'ENUM-01','2025-03-04','approved'),
('sub-000147','committee_register','K10','pr1','Turkana','ALL','2025-03-01','20',NULL,'ENUM-04','2025-04-05','approved'),
('sub-000148','committee_register','K10','pr1','Turkana','ALL','2025-04-01','20',NULL,'ENUM-03','2025-05-05','approved'),
('sub-000149','committee_register','K10','pr1','Turkana','ALL','2025-05-01','20',NULL,'ENUM-03','2025-06-09','approved'),
('sub-000150','committee_register','K10','pr1','Turkana','ALL','2025-06-01','20',NULL,'ENUM-03','2025-07-06','approved'),
('sub-000151','committee_register','K10','pr1','Turkana','ALL','2025-07-01','21',NULL,'ENUM-02','2025-08-08','approved'),
('sub-000152','committee_register','K10','pr1','Turkana','ALL','2025-08-01','21',NULL,'ENUM-03','2025-09-08','approved'),
('sub-000153','committee_register','K10','pr1','Turkana','ALL','2025-09-01','21',NULL,'ENUM-03','2025-10-09','approved'),
('sub-000154','committee_register','K10','pr1','Turkana','ALL','2025-10-01','22',NULL,'ENUM-02','2025-11-03','approved'),
('sub-000155','committee_register','K10','pr1','Turkana','ALL','2025-11-01','22',NULL,'ENUM-04','2025-12-06','approved'),
('sub-000156','committee_register','K10','pr1','Turkana','ALL','2025-12-01','22',NULL,'ENUM-02','2026-01-10','approved'),
('sub-000157','committee_register','K10','pr1','Turkana','ALL','2026-01-01','23',NULL,'ENUM-03','2026-02-08','approved'),
('sub-000158','committee_register','K10','pr1','Turkana','ALL','2026-02-01','23',NULL,'ENUM-02','2026-03-09','approved'),
('sub-000159','committee_register','K10','pr1','Turkana','ALL','2026-03-01','23',NULL,'ENUM-01','2026-04-05','approved'),
('sub-000160','committee_register','K10','pr1','Turkana','ALL','2026-04-01','23',NULL,'ENUM-02','2026-05-05','approved'),
('sub-000161','committee_register','K10','pr1','Turkana','ALL','2026-05-01','24',NULL,'ENUM-03','2026-06-06','approved'),
('sub-000162','committee_register','K10','pr1','Turkana','ALL','2026-06-01','24',NULL,'ENUM-03','2026-07-04','approved'),
('sub-000163','placement_tracker','K4','pr3','Kilifi','ALL','2025-01-01','40',NULL,'ENUM-03','2025-02-06','approved'),
('sub-000164','placement_tracker','K4','pr3','Kilifi','ALL','2025-02-01','53',NULL,'ENUM-03','2025-03-05','approved'),
('sub-000165','placement_tracker','K4','pr3','Kilifi','ALL','2025-03-01','66',NULL,'ENUM-04','2025-04-07','approved'),
('sub-000166','placement_tracker','K4','pr3','Kilifi','ALL','2025-04-01','79',NULL,'ENUM-04','2025-05-07','approved'),
('sub-000167','placement_tracker','K4','pr3','Kilifi','ALL','2025-05-01','92',NULL,'ENUM-02','2025-06-07','approved'),
('sub-000168','placement_tracker','K4','pr3','Kilifi','ALL','2025-06-01','105',NULL,'ENUM-02','2025-07-10','approved'),
('sub-000169','placement_tracker','K4','pr3','Kilifi','ALL','2025-07-01','118',NULL,'ENUM-02','2025-08-06','approved'),
('sub-000170','placement_tracker','K4','pr3','Kilifi','ALL','2025-08-01','131',NULL,'ENUM-02','2025-09-09','approved'),
('sub-000171','placement_tracker','K4','pr3','Kilifi','ALL','2025-09-01','144',NULL,'ENUM-04','2025-10-05','approved'),
('sub-000172','placement_tracker','K4','pr3','Kilifi','ALL','2025-10-01','158',NULL,'ENUM-01','2025-11-05','approved'),
('sub-000173','placement_tracker','K4','pr3','Kilifi','ALL','2025-11-01','171',NULL,'ENUM-02','2025-12-05','approved'),
('sub-000174','placement_tracker','K4','pr3','Kilifi','ALL','2025-12-01','184',NULL,'ENUM-01','2026-01-03','approved'),
('sub-000175','placement_tracker','K4','pr3','Kilifi','ALL','2026-01-01','197',NULL,'ENUM-02','2026-02-10','approved'),
('sub-000176','placement_tracker','K4','pr3','Kilifi','ALL','2026-02-01','210',NULL,'ENUM-01','2026-03-08','approved'),
('sub-000177','placement_tracker','K4','pr3','Kilifi','ALL','2026-03-01','223',NULL,'ENUM-03','2026-04-10','approved'),
('sub-000178','placement_tracker','K4','pr3','Kilifi','ALL','2026-04-01','236',NULL,'ENUM-03','2026-05-03','approved'),
('sub-000179','placement_tracker','K4','pr3','Kilifi','ALL','2026-05-01','249',NULL,'ENUM-03','2026-06-05','approved'),
('sub-000180','placement_tracker','K4','pr3','Kilifi','ALL','2026-06-01','262',NULL,'ENUM-01','2026-07-03','approved');
INSERT INTO kobo.kobo_submissions (submission_id,form_id,kpi_id,project_id,county,ward,period_month,value,sample_size,enumerator,submitted_at,status) VALUES
('sub-000181','clinic_register','K7','pr4','Garissa','ALL','2025-01-01','1150',NULL,'ENUM-02','2025-02-10','approved'),
('sub-000182','clinic_register','K7','pr4','Garissa','ALL','2025-02-01','1200',NULL,'ENUM-04','2025-03-08','approved'),
('sub-000183','clinic_register','K7','pr4','Garissa','ALL','2025-03-01','1260',NULL,'ENUM-04','2025-04-06','approved'),
('sub-000184','clinic_register','K7','pr4','Garissa','ALL','2025-04-01','1320',NULL,'ENUM-02','2025-05-10','approved'),
('sub-000185','clinic_register','K7','pr4','Garissa','ALL','2025-05-01','1380',NULL,'ENUM-01','2025-06-03','approved'),
('sub-000186','clinic_register','K7','pr4','Garissa','ALL','2025-06-01','1440',NULL,'ENUM-01','2025-07-04','approved'),
('sub-000187','clinic_register','K7','pr4','Garissa','ALL','2025-07-01','1500',NULL,'ENUM-04','2025-08-04','approved'),
('sub-000188','clinic_register','K7','pr4','Garissa','ALL','2025-08-01','1560',NULL,'ENUM-03','2025-09-07','approved'),
('sub-000189','clinic_register','K7','pr4','Garissa','ALL','2025-09-01','1620',NULL,'ENUM-04','2025-10-06','approved'),
('sub-000190','clinic_register','K7','pr4','Garissa','ALL','2025-10-01','1680',NULL,'ENUM-03','2025-11-03','approved'),
('sub-000191','clinic_register','K7','pr4','Garissa','ALL','2025-11-01','1720',NULL,'ENUM-03','2025-12-03','approved'),
('sub-000192','clinic_register','K7','pr4','Garissa','ALL','2025-12-01','1720',NULL,'ENUM-04','2026-01-04','approved'),
('sub-000193','clinic_register','K7','pr4','Garissa','ALL','2026-01-01','1690',NULL,'ENUM-04','2026-02-05','approved'),
('sub-000194','clinic_register','K7','pr4','Garissa','ALL','2026-02-01','1650',NULL,'ENUM-03','2026-03-05','approved'),
('sub-000195','clinic_register','K7','pr4','Garissa','ALL','2026-03-01','1540',NULL,'ENUM-03','2026-04-03','approved'),
('sub-000196','clinic_register','K7','pr4','Garissa','ALL','2026-04-01','1420',NULL,'ENUM-04','2026-05-09','approved'),
('sub-000197','clinic_register','K7','pr4','Garissa','ALL','2026-05-01','1310',NULL,'ENUM-02','2026-06-03','approved'),
('sub-000198','clinic_register','K7','pr4','Garissa','ALL','2026-06-01','1310',NULL,'ENUM-02','2026-07-10','approved'),
('sub-000199','clinic_register','K7','pr4','Garissa','Garissa Township','2025-01-01','340.7',NULL,'ENUM-03','2025-02-08','approved'),
('sub-000200','clinic_register','K7','pr4','Garissa','Garissa Township','2025-02-01','353.8',NULL,'ENUM-01','2025-03-03','approved'),
('sub-000201','clinic_register','K7','pr4','Garissa','Garissa Township','2025-03-01','374.9',NULL,'ENUM-01','2025-04-06','approved'),
('sub-000202','clinic_register','K7','pr4','Garissa','Garissa Township','2025-04-01','390.9',NULL,'ENUM-04','2025-05-03','approved'),
('sub-000203','clinic_register','K7','pr4','Garissa','Garissa Township','2025-05-01','407.7',NULL,'ENUM-01','2025-06-06','approved'),
('sub-000204','clinic_register','K7','pr4','Garissa','Garissa Township','2025-06-01','429.9',NULL,'ENUM-02','2025-07-07','approved'),
('sub-000205','clinic_register','K7','pr4','Garissa','Garissa Township','2025-07-01','452.9',NULL,'ENUM-02','2025-08-05','approved'),
('sub-000206','clinic_register','K7','pr4','Garissa','Garissa Township','2025-08-01','467.6',NULL,'ENUM-04','2025-09-03','approved'),
('sub-000207','clinic_register','K7','pr4','Garissa','Garissa Township','2025-09-01','476.9',NULL,'ENUM-03','2025-10-10','approved'),
('sub-000208','clinic_register','K7','pr4','Garissa','Garissa Township','2025-10-01','500.8',NULL,'ENUM-02','2025-11-06','approved'),
('sub-000209','clinic_register','K7','pr4','Garissa','Garissa Township','2025-11-01','527.9',NULL,'ENUM-03','2025-12-08','approved'),
('sub-000210','clinic_register','K7','pr4','Garissa','Garissa Township','2025-12-01','526.6',NULL,'ENUM-04','2026-01-03','approved'),
('sub-000211','clinic_register','K7','pr4','Garissa','Garissa Township','2026-01-01','496.3',NULL,'ENUM-03','2026-02-05','approved'),
('sub-000212','clinic_register','K7','pr4','Garissa','Garissa Township','2026-02-01','488.3',NULL,'ENUM-01','2026-03-06','approved'),
('sub-000213','clinic_register','K7','pr4','Garissa','Garissa Township','2026-03-01','452.3',NULL,'ENUM-03','2026-04-06','approved'),
('sub-000214','clinic_register','K7','pr4','Garissa','Garissa Township','2026-04-01','434.2',NULL,'ENUM-03','2026-05-03','approved'),
('sub-000215','clinic_register','K7','pr4','Garissa','Garissa Township','2026-05-01','396.1',NULL,'ENUM-02','2026-06-07','approved'),
('sub-000216','clinic_register','K7','pr4','Garissa','Garissa Township','2026-06-01','403.2',NULL,'ENUM-02','2026-07-07','approved'),
('sub-000217','clinic_register','K7','pr4','Garissa','Balambala','2025-01-01','190.7',NULL,'ENUM-03','2025-02-09','approved'),
('sub-000218','clinic_register','K7','pr4','Garissa','Balambala','2025-02-01','204.2',NULL,'ENUM-02','2025-03-10','approved'),
('sub-000219','clinic_register','K7','pr4','Garissa','Balambala','2025-03-01','214.3',NULL,'ENUM-02','2025-04-08','approved'),
('sub-000220','clinic_register','K7','pr4','Garissa','Balambala','2025-04-01','222.5',NULL,'ENUM-01','2025-05-08','approved'),
('sub-000221','clinic_register','K7','pr4','Garissa','Balambala','2025-05-01','230.8',NULL,'ENUM-02','2025-06-10','approved'),
('sub-000222','clinic_register','K7','pr4','Garissa','Balambala','2025-06-01','250.0',NULL,'ENUM-03','2025-07-03','approved'),
('sub-000223','clinic_register','K7','pr4','Garissa','Balambala','2025-07-01','257.6',NULL,'ENUM-02','2025-08-07','approved'),
('sub-000224','clinic_register','K7','pr4','Garissa','Balambala','2025-08-01','257.8',NULL,'ENUM-03','2025-09-07','approved'),
('sub-000225','clinic_register','K7','pr4','Garissa','Balambala','2025-09-01','281.8',NULL,'ENUM-04','2025-10-07','approved'),
('sub-000226','clinic_register','K7','pr4','Garissa','Balambala','2025-10-01','278.7',NULL,'ENUM-02','2025-11-10','approved'),
('sub-000227','clinic_register','K7','pr4','Garissa','Balambala','2025-11-01','300.1',NULL,'ENUM-01','2025-12-08','approved'),
('sub-000228','clinic_register','K7','pr4','Garissa','Balambala','2025-12-01','297.3',NULL,'ENUM-03','2026-01-03','approved'),
('sub-000229','clinic_register','K7','pr4','Garissa','Balambala','2026-01-01','280.8',NULL,'ENUM-01','2026-02-07','approved'),
('sub-000230','clinic_register','K7','pr4','Garissa','Balambala','2026-02-01','273.8',NULL,'ENUM-04','2026-03-09','approved'),
('sub-000231','clinic_register','K7','pr4','Garissa','Balambala','2026-03-01','259.2',NULL,'ENUM-01','2026-04-04','approved'),
('sub-000232','clinic_register','K7','pr4','Garissa','Balambala','2026-04-01','237.9',NULL,'ENUM-03','2026-05-05','approved'),
('sub-000233','clinic_register','K7','pr4','Garissa','Balambala','2026-05-01','220.6',NULL,'ENUM-02','2026-06-09','approved'),
('sub-000234','clinic_register','K7','pr4','Garissa','Balambala','2026-06-01','224.2',NULL,'ENUM-03','2026-07-04','approved'),
('sub-000235','clinic_register','K7','pr4','Garissa','Fafi','2025-01-01','217.4',NULL,'ENUM-02','2025-02-10','approved'),
('sub-000236','clinic_register','K7','pr4','Garissa','Fafi','2025-02-01','221.9',NULL,'ENUM-02','2025-03-09','approved'),
('sub-000237','clinic_register','K7','pr4','Garissa','Fafi','2025-03-01','236.5',NULL,'ENUM-02','2025-04-08','approved'),
('sub-000238','clinic_register','K7','pr4','Garissa','Fafi','2025-04-01','256.5',NULL,'ENUM-04','2025-05-05','approved'),
('sub-000239','clinic_register','K7','pr4','Garissa','Fafi','2025-05-01','264.2',NULL,'ENUM-03','2025-06-07','approved'),
('sub-000240','clinic_register','K7','pr4','Garissa','Fafi','2025-06-01','279.1',NULL,'ENUM-04','2025-07-03','approved');
INSERT INTO kobo.kobo_submissions (submission_id,form_id,kpi_id,project_id,county,ward,period_month,value,sample_size,enumerator,submitted_at,status) VALUES
('sub-000241','clinic_register','K7','pr4','Garissa','Fafi','2025-07-01','289.7',NULL,'ENUM-04','2025-08-08','approved'),
('sub-000242','clinic_register','K7','pr4','Garissa','Fafi','2025-08-01','292.9',NULL,'ENUM-02','2025-09-07','approved'),
('sub-000243','clinic_register','K7','pr4','Garissa','Fafi','2025-09-01','304.7',NULL,'ENUM-01','2025-10-08','approved'),
('sub-000244','clinic_register','K7','pr4','Garissa','Fafi','2025-10-01','316.6',NULL,'ENUM-04','2025-11-03','approved'),
('sub-000245','clinic_register','K7','pr4','Garissa','Fafi','2025-11-01','322.5',NULL,'ENUM-04','2025-12-07','approved'),
('sub-000246','clinic_register','K7','pr4','Garissa','Fafi','2025-12-01','334.0',NULL,'ENUM-02','2026-01-10','approved'),
('sub-000247','clinic_register','K7','pr4','Garissa','Fafi','2026-01-01','330.4',NULL,'ENUM-03','2026-02-04','approved'),
('sub-000248','clinic_register','K7','pr4','Garissa','Fafi','2026-02-01','310.7',NULL,'ENUM-04','2026-03-07','approved'),
('sub-000249','clinic_register','K7','pr4','Garissa','Fafi','2026-03-01','292.1',NULL,'ENUM-02','2026-04-10','approved'),
('sub-000250','clinic_register','K7','pr4','Garissa','Fafi','2026-04-01','148.0',NULL,'ENUM-03','2026-05-06','approved'),
('sub-000251','clinic_register','K7','pr4','Garissa','Fafi','2026-05-01','134.0',NULL,'ENUM-04','2026-06-08','approved'),
('sub-000252','clinic_register','K7','pr4','Garissa','Fafi','2026-06-01','243.2',NULL,'ENUM-02','2026-07-08','approved'),
('sub-000253','clinic_register','K7','pr4','Garissa','Ijara','2025-01-01','189.9',NULL,'ENUM-03','2025-02-10','approved'),
('sub-000254','clinic_register','K7','pr4','Garissa','Ijara','2025-02-01','207.5',NULL,'ENUM-02','2025-03-06','approved'),
('sub-000255','clinic_register','K7','pr4','Garissa','Ijara','2025-03-01','214.2',NULL,'ENUM-02','2025-04-06','approved'),
('sub-000256','clinic_register','K7','pr4','Garissa','Ijara','2025-04-01','229.0',NULL,'ENUM-03','2025-05-08','approved'),
('sub-000257','clinic_register','K7','pr4','Garissa','Ijara','2025-05-01','240.0',NULL,'ENUM-03','2025-06-06','approved'),
('sub-000258','clinic_register','K7','pr4','Garissa','Ijara','2025-06-01','239.3',NULL,'ENUM-03','2025-07-08','approved'),
('sub-000259','clinic_register','K7','pr4','Garissa','Ijara','2025-07-01','257.8',NULL,'ENUM-01','2025-08-05','approved'),
('sub-000260','clinic_register','K7','pr4','Garissa','Ijara','2025-08-01','269.4',NULL,'ENUM-02','2025-09-10','approved'),
('sub-000261','clinic_register','K7','pr4','Garissa','Ijara','2025-09-01','275.4',NULL,'ENUM-04','2025-10-10','approved'),
('sub-000262','clinic_register','K7','pr4','Garissa','Ijara','2025-10-01','283.6',NULL,'ENUM-04','2025-11-08','approved'),
('sub-000263','clinic_register','K7','pr4','Garissa','Ijara','2025-11-01','296.1',NULL,'ENUM-03','2025-12-10','approved'),
('sub-000264','clinic_register','K7','pr4','Garissa','Ijara','2025-12-01','295.9',NULL,'ENUM-02','2026-01-08','approved'),
('sub-000265','clinic_register','K7','pr4','Garissa','Ijara','2026-01-01','286.1',NULL,'ENUM-04','2026-02-05','approved'),
('sub-000266','clinic_register','K7','pr4','Garissa','Ijara','2026-02-01','273.5',NULL,'ENUM-04','2026-03-10','approved'),
('sub-000267','clinic_register','K7','pr4','Garissa','Ijara','2026-03-01','267.5',NULL,'ENUM-01','2026-04-05','approved'),
('sub-000268','clinic_register','K7','pr4','Garissa','Ijara','2026-04-01','246.3',NULL,'ENUM-01','2026-05-05','approved'),
('sub-000269','clinic_register','K7','pr4','Garissa','Ijara','2026-05-01','227.3',NULL,'ENUM-02','2026-06-06','approved'),
('sub-000270','clinic_register','K7','pr4','Garissa','Ijara','2026-06-01','229.4',NULL,'ENUM-03','2026-07-04','approved'),
('sub-000271','clinic_register','K7','pr4','Garissa','Dadaab','2025-01-01','194.8',NULL,'ENUM-04','2025-02-10','approved'),
('sub-000272','clinic_register','K7','pr4','Garissa','Dadaab','2025-02-01','201.4',NULL,'ENUM-04','2025-03-08','approved'),
('sub-000273','clinic_register','K7','pr4','Garissa','Dadaab','2025-03-01','218.4',NULL,'ENUM-01','2025-04-03','approved'),
('sub-000274','clinic_register','K7','pr4','Garissa','Dadaab','2025-04-01','218.8',NULL,'ENUM-03','2025-05-06','approved'),
('sub-000275','clinic_register','K7','pr4','Garissa','Dadaab','2025-05-01','235.7',NULL,'ENUM-04','2025-06-04','approved'),
('sub-000276','clinic_register','K7','pr4','Garissa','Dadaab','2025-06-01','248.1',NULL,'ENUM-01','2025-07-04','approved'),
('sub-000277','clinic_register','K7','pr4','Garissa','Dadaab','2025-07-01','257.0',NULL,'ENUM-01','2025-08-05','approved'),
('sub-000278','clinic_register','K7','pr4','Garissa','Dadaab','2025-08-01','264.7',NULL,'ENUM-02','2025-09-04','approved'),
('sub-000279','clinic_register','K7','pr4','Garissa','Dadaab','2025-09-01','277.5',NULL,'ENUM-02','2025-10-04','approved'),
('sub-000280','clinic_register','K7','pr4','Garissa','Dadaab','2025-10-01','290.3',NULL,'ENUM-02','2025-11-03','approved'),
('sub-000281','clinic_register','K7','pr4','Garissa','Dadaab','2025-11-01','290.2',NULL,'ENUM-04','2025-12-04','approved'),
('sub-000282','clinic_register','K7','pr4','Garissa','Dadaab','2025-12-01','291.9',NULL,'ENUM-04','2026-01-08','approved'),
('sub-000283','clinic_register','K7','pr4','Garissa','Dadaab','2026-01-01','289.8',NULL,'ENUM-04','2026-02-04','approved'),
('sub-000284','clinic_register','K7','pr4','Garissa','Dadaab','2026-02-01','272.9',NULL,'ENUM-04','2026-03-09','approved'),
('sub-000285','clinic_register','K7','pr4','Garissa','Dadaab','2026-03-01','256.8',NULL,'ENUM-02','2026-04-06','approved'),
('sub-000286','clinic_register','K7','pr4','Garissa','Dadaab','2026-04-01','246.3',NULL,'ENUM-03','2026-05-08','approved'),
('sub-000287','clinic_register','K7','pr4','Garissa','Dadaab','2026-05-01','217.1',NULL,'ENUM-02','2026-06-10','approved'),
('sub-000288','clinic_register','K7','pr4','Garissa','Dadaab','2026-06-01','226.4',NULL,'ENUM-01','2026-07-06','approved'),
('sub-000289','portal_stats','K13','pr5','Nairobi','ALL','2025-01-01','5',NULL,'ENUM-01','2025-02-05','approved'),
('sub-000290','portal_stats','K13','pr5','Nairobi','ALL','2025-02-01','7',NULL,'ENUM-02','2025-03-05','approved'),
('sub-000291','portal_stats','K13','pr5','Nairobi','ALL','2025-03-01','9',NULL,'ENUM-03','2025-04-10','approved'),
('sub-000292','portal_stats','K13','pr5','Nairobi','ALL','2025-04-01','11',NULL,'ENUM-01','2025-05-10','approved'),
('sub-000293','portal_stats','K13','pr5','Nairobi','ALL','2025-05-01','13',NULL,'ENUM-03','2025-06-03','approved'),
('sub-000294','portal_stats','K13','pr5','Nairobi','ALL','2025-06-01','16',NULL,'ENUM-04','2025-07-07','approved'),
('sub-000295','portal_stats','K13','pr5','Nairobi','ALL','2025-07-01','18',NULL,'ENUM-01','2025-08-10','approved'),
('sub-000296','portal_stats','K13','pr5','Nairobi','ALL','2025-08-01','20',NULL,'ENUM-04','2025-09-05','approved'),
('sub-000297','portal_stats','K13','pr5','Nairobi','ALL','2025-09-01','22',NULL,'ENUM-02','2025-10-08','approved'),
('sub-000298','portal_stats','K13','pr5','Nairobi','ALL','2025-10-01','24',NULL,'ENUM-04','2025-11-05','approved'),
('sub-000299','portal_stats','K13','pr5','Nairobi','ALL','2025-11-01','26',NULL,'ENUM-02','2025-12-10','approved'),
('sub-000300','portal_stats','K13','pr5','Nairobi','ALL','2025-12-01','28',NULL,'ENUM-02','2026-01-06','approved');
INSERT INTO kobo.kobo_submissions (submission_id,form_id,kpi_id,project_id,county,ward,period_month,value,sample_size,enumerator,submitted_at,status) VALUES
('sub-000301','portal_stats','K13','pr5','Nairobi','ALL','2026-01-01','30',NULL,'ENUM-01','2026-02-05','approved'),
('sub-000302','portal_stats','K13','pr5','Nairobi','ALL','2026-02-01','33',NULL,'ENUM-01','2026-03-09','approved'),
('sub-000303','portal_stats','K13','pr5','Nairobi','ALL','2026-03-01','35',NULL,'ENUM-01','2026-04-04','approved'),
('sub-000304','portal_stats','K13','pr5','Nairobi','ALL','2026-04-01','37',NULL,'ENUM-02','2026-05-07','approved'),
('sub-000305','portal_stats','K13','pr5','Nairobi','ALL','2026-05-01','39',NULL,'ENUM-01','2026-06-07','approved'),
('sub-000306','portal_stats','K13','pr5','Nairobi','ALL','2026-06-01','41',NULL,'ENUM-03','2026-07-10','approved'),
('sub-000307','portal_stats','K6','pr5','Nairobi','ALL','2025-01-01','1800',NULL,'ENUM-04','2025-02-08','approved'),
('sub-000308','portal_stats','K6','pr5','Nairobi','ALL','2025-02-01','2000',NULL,'ENUM-04','2025-03-08','approved'),
('sub-000309','portal_stats','K6','pr5','Nairobi','ALL','2025-03-01','2300',NULL,'ENUM-03','2025-04-10','approved'),
('sub-000310','portal_stats','K6','pr5','Nairobi','ALL','2025-04-01','2600',NULL,'ENUM-01','2025-05-09','approved'),
('sub-000311','portal_stats','K6','pr5','Nairobi','ALL','2025-05-01','2900',NULL,'ENUM-04','2025-06-10','approved'),
('sub-000312','portal_stats','K6','pr5','Nairobi','ALL','2025-06-01','3200',NULL,'ENUM-01','2025-07-08','approved'),
('sub-000313','portal_stats','K6','pr5','Nairobi','ALL','2025-07-01','3500',NULL,'ENUM-04','2025-08-09','approved'),
('sub-000314','portal_stats','K6','pr5','Nairobi','ALL','2025-08-01','3700',NULL,'ENUM-03','2025-09-04','approved'),
('sub-000315','portal_stats','K6','pr5','Nairobi','ALL','2025-09-01','3900',NULL,'ENUM-01','2025-10-03','approved'),
('sub-000316','portal_stats','K6','pr5','Nairobi','ALL','2025-10-01','4100',NULL,'ENUM-02','2025-11-07','approved'),
('sub-000317','portal_stats','K6','pr5','Nairobi','ALL','2025-11-01','4300',NULL,'ENUM-04','2025-12-09','approved'),
('sub-000318','portal_stats','K6','pr5','Nairobi','ALL','2025-12-01','4300',NULL,'ENUM-02','2026-01-08','approved'),
('sub-000319','portal_stats','K6','pr5','Nairobi','ALL','2026-01-01','4200',NULL,'ENUM-04','2026-02-04','approved'),
('sub-000320','portal_stats','K6','pr5','Nairobi','ALL','2026-02-01','3900',NULL,'ENUM-03','2026-03-04','approved'),
('sub-000321','portal_stats','K6','pr5','Nairobi','ALL','2026-03-01','3600',NULL,'ENUM-04','2026-04-08','approved'),
('sub-000322','portal_stats','K6','pr5','Nairobi','ALL','2026-04-01','3300',NULL,'ENUM-01','2026-05-10','approved'),
('sub-000323','portal_stats','K6','pr5','Nairobi','ALL','2026-05-01','3100',NULL,'ENUM-03','2026-06-10','approved'),
('sub-000324','portal_stats','K6','pr5','Nairobi','ALL','2026-06-01','3100',NULL,'ENUM-02','2026-07-04','approved'),
('sub-000325','training_register','K9','pr7','Kisumu','ALL','2025-01-01','40',NULL,'ENUM-04','2025-02-05','approved'),
('sub-000326','training_register','K9','pr7','Kisumu','ALL','2025-02-01','49',NULL,'ENUM-03','2025-03-06','approved'),
('sub-000327','training_register','K9','pr7','Kisumu','ALL','2025-03-01','58',NULL,'ENUM-04','2025-04-09','approved'),
('sub-000328','training_register','K9','pr7','Kisumu','ALL','2025-04-01','66',NULL,'ENUM-04','2025-05-07','approved'),
('sub-000329','training_register','K9','pr7','Kisumu','ALL','2025-05-01','75',NULL,'ENUM-03','2025-06-06','approved'),
('sub-000330','training_register','K9','pr7','Kisumu','ALL','2025-06-01','84',NULL,'ENUM-04','2025-07-03','approved'),
('sub-000331','training_register','K9','pr7','Kisumu','ALL','2025-07-01','93',NULL,'ENUM-04','2025-08-10','approved'),
('sub-000332','training_register','K9','pr7','Kisumu','ALL','2025-08-01','102',NULL,'ENUM-02','2025-09-05','approved'),
('sub-000333','training_register','K9','pr7','Kisumu','ALL','2025-09-01','111',NULL,'ENUM-01','2025-10-07','approved'),
('sub-000334','training_register','K9','pr7','Kisumu','ALL','2025-10-01','119',NULL,'ENUM-04','2025-11-05','approved'),
('sub-000335','training_register','K9','pr7','Kisumu','ALL','2025-11-01','128',NULL,'ENUM-01','2025-12-10','approved'),
('sub-000336','training_register','K9','pr7','Kisumu','ALL','2025-12-01','137',NULL,'ENUM-04','2026-01-09','approved'),
('sub-000337','training_register','K9','pr7','Kisumu','ALL','2026-01-01','146',NULL,'ENUM-01','2026-02-06','approved'),
('sub-000338','training_register','K9','pr7','Kisumu','ALL','2026-02-01','155',NULL,'ENUM-04','2026-03-05','approved'),
('sub-000339','training_register','K9','pr7','Kisumu','ALL','2026-03-01','164',NULL,'ENUM-03','2026-04-09','approved'),
('sub-000340','training_register','K9','pr7','Kisumu','ALL','2026-04-01','172',NULL,'ENUM-02','2026-05-10','approved'),
('sub-000341','training_register','K9','pr7','Kisumu','ALL','2026-05-01','181',NULL,'ENUM-04','2026-06-10','approved'),
('sub-000342','training_register','K9','pr7','Kisumu','ALL','2026-06-01','190',NULL,'ENUM-02','2026-07-10','approved'),
('sub-000343','business_followup','K3','pr2','Kisumu','ALL','2025-01-01','54',NULL,'ENUM-03','2025-02-06','approved'),
('sub-000344','business_followup','K3','pr2','Kisumu','ALL','2025-03-01','61',NULL,'ENUM-01','2025-04-07','approved'),
('sub-000345','business_followup','K3','pr2','Kisumu','ALL','2025-06-01','66',NULL,'ENUM-02','2025-07-10','approved'),
('sub-000346','business_followup','K3','pr2','Kisumu','ALL','2025-09-01','70',NULL,'ENUM-04','2025-10-05','approved'),
('sub-000347','business_followup','K3','pr2','Kisumu','ALL','2025-12-01','75',NULL,'ENUM-01','2026-01-05','approved'),
('sub-000348','business_followup','K3','pr2','Kisumu','ALL','2026-03-01','79',NULL,'ENUM-02','2026-04-09','approved'),
('sub-000349','business_followup','K3','pr2','Kisumu','ALL','2026-06-01','79',NULL,'ENUM-03','2026-07-04','approved'),
('sub-000350','business_followup','K11','pr2','Kisumu','ALL','2025-03-01','41',NULL,'ENUM-01','2025-04-06','approved'),
('sub-000351','business_followup','K11','pr2','Kisumu','ALL','2025-06-01','45',NULL,'ENUM-03','2025-07-04','approved'),
('sub-000352','business_followup','K11','pr2','Kisumu','ALL','2025-09-01','50',NULL,'ENUM-04','2025-10-03','approved'),
('sub-000353','business_followup','K11','pr2','Kisumu','ALL','2025-12-01','54',NULL,'ENUM-03','2026-01-06','approved'),
('sub-000354','business_followup','K11','pr2','Kisumu','ALL','2026-03-01','58',NULL,'ENUM-03','2026-04-08','approved'),
('sub-000355','business_followup','K11','pr2','Kisumu','ALL','2026-06-01','61',NULL,'ENUM-04','2026-07-06','approved'),
('sub-000356','clinic_register','K12','pr4','Garissa','ALL','2025-03-01','58',NULL,'ENUM-02','2025-04-03','approved'),
('sub-000357','clinic_register','K12','pr4','Garissa','ALL','2025-06-01','62',NULL,'ENUM-01','2025-07-04','approved'),
('sub-000358','clinic_register','K12','pr4','Garissa','ALL','2025-09-01','65',NULL,'ENUM-01','2025-10-05','approved'),
('sub-000359','clinic_register','K12','pr4','Garissa','ALL','2025-12-01','68',NULL,'ENUM-03','2026-01-03','approved'),
('sub-000360','clinic_register','K12','pr4','Garissa','ALL','2026-03-01','70',NULL,'ENUM-01','2026-04-09','approved');
INSERT INTO kobo.kobo_submissions (submission_id,form_id,kpi_id,project_id,county,ward,period_month,value,sample_size,enumerator,submitted_at,status) VALUES
('sub-000361','clinic_register','K12','pr4','Garissa','ALL','2026-06-01','71',NULL,'ENUM-03','2026-07-06','approved'),
('sub-000362','vaccination_campaign','K5','pr6','Turkana','ALL','2025-03-01','40',NULL,'ENUM-01','2025-04-05','approved'),
('sub-000363','vaccination_campaign','K5','pr6','Turkana','ALL','2025-06-01','46',NULL,'ENUM-01','2025-07-09','approved'),
('sub-000364','vaccination_campaign','K5','pr6','Turkana','ALL','2025-09-01','51',NULL,'ENUM-03','2025-10-05','approved'),
('sub-000365','vaccination_campaign','K5','pr6','Turkana','ALL','2025-12-01','55',NULL,'ENUM-01','2026-01-04','approved'),
('sub-000366','vaccination_campaign','K5','pr6','Turkana','ALL','2026-03-01','59',NULL,'ENUM-03','2026-04-05','approved'),
('sub-000367','vaccination_campaign','K5','pr6','Turkana','ALL','2026-06-01','62',NULL,'ENUM-04','2026-07-06','approved'),
('sub-000368','cooperative_check','K8','pr8','Garissa','ALL','2025-03-01','12',NULL,'ENUM-03','2025-04-05','approved'),
('sub-000369','cooperative_check','K8','pr8','Garissa','ALL','2025-06-01','13',NULL,'ENUM-02','2025-07-04','approved'),
('sub-000370','cooperative_check','K8','pr8','Garissa','ALL','2025-09-01','11',NULL,'ENUM-01','2025-10-09','approved'),
('sub-000371','cooperative_check','K8','pr8','Garissa','ALL','2025-12-01','7',NULL,'ENUM-03','2026-01-03','approved'),
('sub-000372','cooperative_check','K8','pr8','Garissa','ALL','2026-03-01','4',NULL,'ENUM-04','2026-04-06','approved'),
('sub-000373','cooperative_check','K8','pr8','Garissa','ALL','2026-06-01','6',NULL,'ENUM-04','2026-07-07','approved');
