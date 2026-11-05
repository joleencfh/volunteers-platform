# Security policy

## Reporting a vulnerability

Please report security problems privately, using GitHub's **private vulnerability reporting**: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue and do not include real personal data in the report.

You can expect an acknowledgement within a few days. This is a volunteer-run project, so fixes are made on a best-effort basis; we will keep you informed and credit you if you wish.

## Scope

This repository holds the PauseAI Italy volunteer platform. Of particular interest: authentication and the admin approval check, row-level security (what each person can read or write), exposure of admin-only personal data (real names, emails, city), and the service-role key.

## What this repository never contains

Real personal data, keys, connection strings or `.env` files (see `docs/runbook.md` for how secrets are handled). If you find any in the repository or its history, please report it the same way.
