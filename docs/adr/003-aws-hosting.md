# ADR-003: Host on AWS (S3 + CloudFront + Route 53), managed with Terraform

- **Status:** Accepted
- **Date:** 2026-11-13 (decided); 2026-11-19 (foundation built in step 04; hosting follows in step 05)

## Context

Lumineglyph is a static website (HTML, CSS, JS, assets, etc.) (ADR-001) that has the following requirements:
- HTTPS on `lumineglyph.com`, `www`, and a preview site per pull request
- security headers that can't be set by a meta tag (ADR-002)
- fast connection for users in Japan (who make up the biggest target audience)
- low cost (less than $10 USD per month)

This "rebuild" also serves as a portfolio piece demonstrating Infrastructure as Code (IaC), a review processes, and meaningful security.

## Decision

1. Hosting -- a private S3 bucket served via CloudFront with an ACM certificate and a response-headers policy to set the security headers (step 05).
2. DNS and domain -- Route 53 serves as both the registrar and dns host for `lumineglyph.com`.
3. IaC - Terraform used for everything in AWS:
  - `infra/bootstrap` to create the S3 bucket holding Terraform's state plus its own state.
  - `infra/main` to hold everything else such as budget, hosted zone, certificate and buckets and Cloudfront (from step 05).
  - State is versioned, encrypted, HTTPS-only, and locked wiht S3's own lock files via `use_lockfile` (i.e. no DynamoDB table necessary).
4. Regions -- `ap-northeast-1` (Tokyo) by default; `us-east-1` only when required by AWS, i.e. the CloudFront certificate and the DNSSEC signing key from step 08. AWS provider v6 allows resources to set their own regions, so one provider covers both.
5. Account -- a dedicated `lumineglyph` member account in the AWS organization, not the management account.

### Options considered

1. Netlify, Vercel, or Cloudflare Pages -- free for such a site, HTTPS and previews built in, short setup time. Cloudflare Pges would also handle headers and DNS. Those options would not allow for the demonstration of e.g. CDN configuration, certificates, IAM, and OIDC deploys, and to complement the engineer's work environment and add more tangible projects built in it.
2. S3 static website hosting with no CloudFront -- S3 would only serve HTTP with no security headers such as HSTS.
3. AWS Amplify Hosting -- same as option 1.
4. S3 + CloudFront + Route 53 (chosen) -- Everything is visible and configurable in code, and the entire site exists in one AWS account.

For the tooling:
- **Terraform (chosen):** the most widely used IaC tool and the one the engineer's team has begun using in production. `plan` shows every change before it happens, and one provider covers everything including the domain registration.
- **AWS CDK / CloudFormation:** AWS-only, and CloudFormation can't manage domain registrations.
- **OpenTofu:** the open-source fork of Terraform after its 2023 licence change. It's compatible with this code and would be an easy switch if the licence ever matters.
- **Console clicks:** rejected; settings nobody wrote down can't be reviewed or rebuilt.

### Why a dedicated AWS account

At the onset of step 04, the CLI profile pointed at the Organization's management account, which also pays for unrelated projects. A member account specific to Lumineglyph has these benefits:
- The budget counts Lumineglyph's costs only.
- It keeps the CI deploy role (step 06) away from the Organization's controls.
- It lets service control policies (SCPs) apply later and not touch the management account.

The account was created with no root credentials (centralized root access).

## Consequences

**Positive**
- Every AWS setting is in the repo and reviewed through `terraform plan` in a PR.
- The bucket is private; only CloudFront can read it.
- The cost is low: about $0.50/month for the hosted zone and $16/year for the domain. CloudFront's always-free tier and a few cents of S3 cover the traffic. A $5/month budget alert emails the engineer about unexpected expenses.
- Edge locations in Japan serve cached pages, and a cache miss only travels as far as Tokyo.

**Negative / trade-offs**
- More complex than a hosting platform: the bucket policy, CloudFront function, headers policy, certificate, DNS records and IAM roles all have to be written and maintained, where Netlify or Cloudflare would provide them.
- Previews per PR have to be built by hand (step 07). Hosting platforms include them.
- There are two regions to keep in mind: a certificate created in Tokyo by mistake applies without error; it only fails later, when CloudFront refuses to use it.
- The state bucket is created by hand once (the bootstrap stack) and must never be deleted (`prevent_destroy`).
- The domain registration has to start in the management account, which is not the most desired result. Route 53 Domains didn't work in the brand-new member account (`DONT_KNOW` for every name for over 24 hours, cause unknown). The domain was registered in the management account on 2026-11-19 and points at the Terraform zone in the member account. It moves to the member account after AWS's 14-day wait (step 04 G). Until then, the registration is managed by hand.
- Terraform's licence (BSL) isn't open source. That doesn't affect this use; if it becomes an issue, OpenTofu is the solution.
