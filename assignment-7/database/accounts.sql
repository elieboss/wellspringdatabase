-- ============================================================
-- WELLSPRING — SIGN-IN ACCOUNTS (Assignment 7)
-- ============================================================
-- Run after wellspring.sql. Adds the one table the feature needs
-- for protected access: a sign-in account for a person.
--
-- Design decisions
--   * account is 1-to-1 with person (person_id is both the primary
--     key and a foreign key), so the existing person table and its
--     person_type (Staff, Volunteer, Board) stay the single source
--     of who someone is and what they may do.
--   * People sign in with person.email, so emails must be unique.
--   * Only a password HASH is stored (scrypt, with a random salt per
--     account). The server never stores or logs plain passwords.
--
-- The five accounts below are FICTIONAL TEST ACCOUNTS for the
-- evaluator. They all use the test password listed in README.md.
-- ============================================================


-- Sign-in uses email, so two people cannot share one.
create unique index person_email_unique on person (lower(email));

-- ACCOUNT
-- A person who may sign in. Removing a login sets is_active = false;
-- the person and their reports are kept.
create table account (
  person_id     int primary key references person (person_id),
  password_hash text not null check (password_hash like 'scrypt$%'),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table account enable row level security;


-- ------------------------------------------------------------
-- Sample data: one test account per sample person
-- ------------------------------------------------------------
-- 3 Staff (Dana Lee, Marcus Hill, Ava Thompson), 1 Volunteer
-- (Priya Shah) and 1 Board member (Jordan Ruiz).

insert into account (person_id, password_hash)
select p.person_id, a.password_hash
from (values
  ('dana.lee@wellspring.example', 'scrypt$8a05da0dcbb561eab4ebf271ddabc48d$5460a2c1e0d81fabf17512601d95c5a64b0ccafd83756b462826e67c1ba9c7a77d51a3016b98725408d18974fd3d466f97463d115b6fc49edcb7e73f7ab8860b'),
  ('marcus.hill@wellspring.example', 'scrypt$8c9127e9e1b4d5d784a39a0f93036389$d8284bd3104f27dd2fa927f037e83b26b85de661f0c8e064bf3e89d47c92a7d0c8dea4d2d80c34580a80579c6a0a71ec61fc80013898178fa7e0b36da62ddf36'),
  ('ava.thompson@wellspring.example', 'scrypt$5161aee441f5b062582c7e70848fcc49$56476cefe97ab8765cec77d6cf01956a203f8fb8d0554a551cc4c8c30bd179f6d4e4cb1ed47f447da8e4867988afa54f5d1dff9512a48053bd78b48cf752b0f2'),
  ('priya.shah@example.com', 'scrypt$1cc6218363919420ddf734f25b4677cb$066d3f70a5419b6174a742eacf45bf835173fd490053b93d78cbbbae500042ae621cf5998011fe379a198557930d2fb710b23f3a8c4dbdb9e3705102140ea71e'),
  ('jordan.ruiz@example.com', 'scrypt$1ac2052f47ac4a05ef1e2f4edf07f0f8$3fbe8d2f0a9a968039c15522ae57df67216bb6b03cc62dba84407aaa1cf9e1b69cc3c4eebf2e3c89186d515f90cf2771f9c3d0c9c2f3611cbb1e66a905ea355e')
) as a (email, password_hash)
join person p on lower(p.email) = a.email;
