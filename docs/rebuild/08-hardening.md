# 08 — Hardening: email, DNS, DNSSEC, alarms, scanners

## Goal

- **Email:** `hello@lumineglyph.com` reaches both of you, and mail that fakes a `@lumineglyph.com` sender is rejected.
- **CAA:** only Amazon's certificate authority may issue certificates for the domain.
- **DNSSEC:** the zone is signed now. The chain of trust from `.com` is added after step 04 G.
- **Alarms:** an email when DNSSEC signing breaks or the site starts failing.
- **Scanners in CI:**
  - Terraform format and validation
  - checkov (infrastructure misconfigurations)
  - zizmor (workflow security)
  - an accessibility check in both themes
- **GitHub settings:** CodeQL scanning, plus a `SECURITY.md`.

## Why it matters

Most small sites skip all of this. Each part is cheap, quick to check from outside, and protects a business domain from real abuse:
- someone sending mail "from" `hello@lumineglyph.com`
- a certificate issued for the domain by another authority
- forged DNS answers

The scanners keep it that way: a future change that weakens something fails the PR instead of reaching production.

## Decisions already made (2026-11-22)

| Question | Decision |
|---|---|
| Email | **Forwarding only, ImprovMX free plan.** `hello@` → both of your existing inboxes. No catch-all. Receive-only: replies come from your own addresses. Forward Email's free plan was rejected: it keeps the forwarding rules in a public DNS record, which would publish both destination addresses (and, through Terraform, put them in the public repo). |
| DNSSEC timing | **Sign the zone now; link it to `.com` after step 04 G** (from 2026-12-03). The link has to be made where the domain is registered, so waiting keeps it in Terraform from the start. Signing without the link is harmless: resolvers treat the zone as unsigned until the DS record exists. |
| HSTS preload | **Not now.** Section G explains it; decide after a few weeks of clean running. |

## How this step works

Same as steps 05–07:
- You write the files and run every command that changes something: `terraform apply`, `gh api -X PUT/PATCH`, `aws cloudwatch set-alarm-state`, git, and the ImprovMX sign-up.
- Claude runs `terraform plan` and checks it before each apply.
- `AWS_PROFILE=lumineglyph` must be **exported** in every terminal you use (`printenv AWS_PROFILE` should print it).

The order:
1. **A:** email forwarding (ImprovMX, then MX, SPF and DMARC records).
2. **B:** the CAA record.
3. **C:** DNSSEC signing (C.1–C.4 now; C.5 after step 04 G, in its own PR).
4. **D:** the alerts topic and three alarms.
5. **E:** the `security` CI job, checkov settings, and the accessibility check in `build`.
6. **F:** CodeQL and `SECURITY.md`.
7. **H:** push, PR, make `security` a required check, merge.

**What it costs:**

| Item | Cost |
|---|---|
| KMS key for DNSSEC | $1.00/month |
| Three CloudWatch alarms | $0.30/month |
| SNS emails | free (1,000/month) |
| ImprovMX | free |

That's about $1.30/month on top of today's ~$0.50 (the hosted zone), still well under the $5 budget.

## What Claude already checked (2026-11-22)

- **The zone today** has no MX, TXT or CAA records, so A and B create records rather than replace any.
- **ImprovMX:**
  - MX records are `mx1.improvmx.com` (priority 10) and `mx2.improvmx.com` (priority 20).
  - SPF is `v=spf1 include:spf.improvmx.com ~all`; ImprovMX uses the domain for bounce handling when it forwards.
  - The free plan allows 1 domain, 25 aliases and 500 forwarded emails a day, and no sending.
- **CAA:** ACM's documentation lists exactly four names: `amazon.com`, `amazontrust.com`, `awstrust.com`, `amazonaws.com`. With no `issuewild` record, the `issue` list also covers wildcard certificates (`*.preview`), so the existing certificate can still renew.
- **DNSSEC:**
  - **Key:** Route 53 needs an `ECC_NIST_P256` / `SIGN_VERIFY` KMS key in `us-east-1`. The key policy follows the provider's documented example, narrowed to this one hosted zone.
  - **Monitoring:** AWS "strongly recommends" alarms on `DNSSECInternalFailure` and `DNSSECKeySigningKeysNeedingAction`.
  - **Region:** `aws_route53_key_signing_key` and the Route 53 Domains resources take no `region` argument in provider 6.73; `aws_kms_key`, SNS and CloudWatch alarms do.
- **Terraform.** All of A–D, plus C.5's DS record, added to a scratch copy of `infra/main`: `terraform fmt` is clean and `terraform validate` succeeds. Both stacks also validate in a fresh folder with **no AWS credentials** (`init -backend=false`, providers checked against the lock files), which is exactly what the CI job does.
- **checkov 3.4.5** on today's `infra/` reports 28 findings. With A–D added, the settings file in E.2 and the inline skips, it reports **169 passed, 0 failed**. Each accepted finding has its reason written next to it. Removing any one skip makes checkov exit 1, so the job does fail when it should.
- **The accessibility check** (E.4) ran against the current build: 20 runs (5 pages × light/dark × desktop/phone), no violations. With a dark-mode-only contrast bug injected into the CSS, it failed on every affected page and exited 1. It uses the Chrome already installed on GitHub's Ubuntu runners, so there's nothing to download.
- **The site with E.4 applied** (in a scratch copy, using the exact `npm` commands): `astro check` 0 errors, the build works, the test passes. `package.json` gains only the two packages and the script.
- **Workflows:** both, with E.5's changes, report no zizmor findings: offline, online and pedantic. The scanners install from `requirements.txt` with plain `pip` on Python 3.12 (the runner's version), and both run.
- **Versions**, each at least 7 days old: checkov 3.4.5 (2026-11-12), zizmor 1.32.0 (2026-11-02), Terraform 1.17.2 (2026-11-11), `hashicorp/setup-terraform` v4.0.1 (`dfe3c3f8…`), playwright-core 1.65.1 (2026-11-13), @axe-core/playwright 4.14.0 (2026-10-15).
- **GitHub:** Dependabot alerts are on, private vulnerability reporting is on, and CodeQL default setup is `not-configured`. The ruleset change in H.3 keeps every existing rule and only adds `security` next to `build`.

**Not checked in advance:**
- Whether CodeQL's GitHub-managed workflow runs with this repo's "require SHA-pinned actions" setting. F.1 shows it.
- Whether the ImprovMX dashboard shows the same SPF value for your account. A.1 says to compare.

## Before you start

**1. Branch.** The new step file and PROGRESS go on it:
```sh
cd ~/code/ged/lumineglyph
git switch main && git pull
git switch -c rebuild/08-hardening
git status            # docs/rebuild/08-hardening.md and docs/rebuild/PROGRESS.md (modified)
git add docs/rebuild/08-hardening.md docs/rebuild/PROGRESS.md
git commit -m "docs(rebuild): step 08 instructions"
```

**2. Log in:**
```sh
aws sso login --profile lumineglyph
export AWS_PROFILE=lumineglyph
aws sts get-caller-identity --query Account --output text   # 421803180949
terraform -chdir=infra/main plan                            # expect: No changes
```

### A. Email forwarding

**1. Set up ImprovMX** (in the browser, about 5 minutes):
1. Go to https://improvmx.com, enter `lumineglyph.com` and **your** email address, and create the account.
   - Turn on two-factor authentication in the account settings if it's offered. This account controls where the business's mail goes.
2. In the domain's **Aliases**, ImprovMX starts with a catch-all alias `*`. **Delete it.** You chose no catch-all, so mail to random names bounces.
3. Add the alias `hello`, forwarding to **both** addresses (yours and Moena's), separated by a comma.
4. In the domain's **DNS settings**, compare the values with A.2. If the SPF value isn't exactly `v=spf1 include:spf.improvmx.com ~all`, or the MX hosts differ, stop and tell Claude.

The two Gmail addresses live only in ImprovMX. They must never go in the repo, which is public.

**2. Create `infra/main/email.tf`:**
```hcl
# Email for @lumineglyph.com (step 08 A): receive-only forwarding through ImprovMX's free plan.
# hello@ goes to the owners' own inboxes. Those destination addresses are set in the ImprovMX dashboard,
# not here, because this repo is public. Nothing sends mail as @lumineglyph.com.

resource "aws_route53_record" "mx" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 3600
  records = ["10 mx1.improvmx.com", "20 mx2.improvmx.com"]
}

# SPF: which servers may send mail with this domain as the envelope sender. ImprovMX uses the
# domain for bounces when it forwards, so it's listed. Route 53 allows one TXT record set per name:
# any other TXT value for the bare domain (a site verification, say) goes in this same list.
resource "aws_route53_record" "apex_txt" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "TXT"
  ttl     = 3600
  records = ["v=spf1 include:spf.improvmx.com ~all"]
}

# DMARC: receivers reject mail that claims to be from @lumineglyph.com (or a subdomain) but fails
# SPF and DKIM alignment. Strict, because nothing legitimately sends as the domain. If replying as
# hello@ is ever set up (a paid plan with SMTP), add its DKIM record first and check this still passes.
resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  ttl     = 3600
  records = ["v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s"]
}
```

**3. Plan:**
```sh
cd infra/main
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **3 to add**: the MX record, the apex TXT (SPF) record and the DMARC record. Nothing should change or be destroyed.

```sh
terraform apply main.tfplan
rm main.tfplan
cd ../..
```

**4. Check:**
```sh
dig +short MX lumineglyph.com
dig +short TXT lumineglyph.com
dig +short TXT _dmarc.lumineglyph.com
```
- [ ] The two MX hosts, the SPF value and the DMARC value. In the ImprovMX dashboard, the domain turns green ("Email forwarding active"); that can take a few minutes.

**5. Test it.** Use an address that is **not** one of the two destinations (a work address, another account, or a friend's). Gmail hides a message you sent to yourself, so a test from either Gmail address proves nothing.
- Send a message to `hello@lumineglyph.com`. **Both** inboxes receive it. Check spam the first time and mark it "Not spam".
- Send a message to `nobody@lumineglyph.com`. It comes back as undeliverable (no catch-all).

**6. Commit:**
```sh
git add infra/main/email.tf
git commit -m "feat(infra): email forwarding and anti-spoofing records"
```

### B. CAA

**1. Add this to the end of `infra/main/dns.tf`**, after the `name_servers` output. Leave one blank line before it:
```hcl
# CAA: only Amazon's certificate authorities (ACM) may issue certificates for the domain and every
# subdomain. With no `issuewild` record, the same list covers wildcards (*.preview). These are the four
# names ACM documents.
resource "aws_route53_record" "caa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "CAA"
  ttl     = 3600
  records = [
    "0 issue \"amazon.com\"",
    "0 issue \"amazontrust.com\"",
    "0 issue \"awstrust.com\"",
    "0 issue \"amazonaws.com\"",
  ]
}
```

**2. Plan:**
```sh
cd infra/main
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **1 to add**: the CAA record. The zone itself must show no change.

```sh
terraform apply main.tfplan
rm main.tfplan
cd ../..
dig +short CAA lumineglyph.com        # the four "issue" lines
```

**3. Commit:**
```sh
git add infra/main/dns.tf
git commit -m "feat(infra): CAA record"
```

### C. DNSSEC signing

> **A broken DNSSEC setup takes the whole domain offline.** That can only happen once the `.com` link (C.5) exists. That's why it's a separate apply, weeks later, after checks. C.1–C.4 only sign the zone, which visitors don't notice.

**1. Create `infra/main/dnssec.tf`:**
```hcl
# DNSSEC (step 08 C): Route 53 signs the zone's records, so resolvers can detect forged answers.
# Signing alone changes nothing for visitors. Validation starts only when the DS record is added at the
# .com registry, which happens after step 04 G (see 08 C.5). Until then the zone is signed but "insecure".
#
# To turn DNSSEC off, never just delete these resources: remove the DS record first, wait 2 days, then stop
# signing. The other order takes the whole domain offline (runbook: step 08 "Undo DNSSEC").

data "aws_caller_identity" "current" {}

# The key-signing key's private half lives in KMS and never leaves it. Route 53 requires an asymmetric
# ECC_NIST_P256 key in us-east-1. Costs $1/month.
resource "aws_kms_key" "dnssec" {
  #checkov:skip=CKV_AWS_7:Automatic rotation isn't available for asymmetric keys. A KSK is rotated by hand in Route 53.
  region                   = "us-east-1"
  description              = "Route 53 DNSSEC key-signing key for ${var.domain}"
  customer_master_key_spec = "ECC_NIST_P256"
  key_usage                = "SIGN_VERIFY"
  deletion_window_in_days  = 30 # the longest AWS allows, so a mistaken delete can be cancelled
  policy                   = data.aws_iam_policy_document.dnssec_kms.json
}

resource "aws_kms_alias" "dnssec" {
  region        = "us-east-1"
  name          = "alias/lumineglyph-dnssec"
  target_key_id = aws_kms_key.dnssec.key_id
}

# Key policy: Route 53's DNSSEC service may use the key, but only for this account's hosted zone
# (the conditions stop another account tricking Route 53 into using it). The account itself keeps
# full control through IAM, as every KMS key policy needs.
data "aws_iam_policy_document" "dnssec_kms" {
  #checkov:skip=CKV_AWS_109:A key policy's Resource "*" means this key only; the account-admin statement is the standard KMS default.
  #checkov:skip=CKV_AWS_111:Same: in a key policy, Resource "*" is this key, not every resource.
  #checkov:skip=CKV_AWS_356:Same: in a key policy, Resource "*" is this key, not every resource.
  statement {
    sid       = "AllowRoute53DnssecService"
    effect    = "Allow"
    actions   = ["kms:DescribeKey", "kms:GetPublicKey", "kms:Sign"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["dnssec-route53.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:route53:::hostedzone/${aws_route53_zone.main.zone_id}"]
    }
  }

  statement {
    sid       = "AllowRoute53DnssecServiceToCreateGrant"
    effect    = "Allow"
    actions   = ["kms:CreateGrant"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["dnssec-route53.amazonaws.com"]
    }

    condition {
      test     = "Bool"
      variable = "kms:GrantIsForAWSResource"
      values   = ["true"]
    }
  }

  statement {
    sid       = "EnableIamPolicies"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
}

resource "aws_route53_key_signing_key" "main" {
  hosted_zone_id             = aws_route53_zone.main.id
  key_management_service_arn = aws_kms_key.dnssec.arn
  name                       = "lumineglyph_ksk_1"
}

resource "aws_route53_hosted_zone_dnssec" "main" {
  hosted_zone_id = aws_route53_key_signing_key.main.hosted_zone_id

  depends_on = [aws_route53_key_signing_key.main]
}

# The DS record the .com registry will need (08 C.5). Not secret: it's published in DNS.
output "dnssec_ds_record" {
  value = aws_route53_key_signing_key.main.ds_record
}
```

The three `#checkov:skip` lines are for the scanner added in E. Each records why a finding is accepted. They don't affect Terraform.

**2. Plan:**
```sh
cd infra/main
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **4 to add**:
  - the KMS key (in `us-east-1`)
  - its alias
  - the key-signing key
  - the zone's DNSSEC setting

  Nothing should change or be destroyed, in particular not the zone. Claude also checks the key policy is limited to this hosted zone.

```sh
terraform apply main.tfplan
rm main.tfplan
terraform plan                      # expect: No changes
cd ../..
```
The DNSSEC part can take a few minutes.

**3. Check the zone is signed:**
```sh
aws route53 get-dnssec --hosted-zone-id Z00567272MES5QFM0F0BM \
  --query '{status: Status.ServeSignature, ksk: KeySigningKeys[].{name: Name, status: Status}}'
dig +dnssec +norec SOA lumineglyph.com @ns-34.awsdns-04.com | grep -E 'RRSIG|DNSKEY|flags'
dig +short DS lumineglyph.com @a.gtld-servers.net      # nothing yet: no link to .com
```
- [ ] `SIGNING`, the KSK `ACTIVE`, an `RRSIG` line in the `dig` answer, and no DS at `.com`.
- [ ] The site still loads: `curl -sI https://lumineglyph.com/ | head -1` gives `HTTP/2 200`.

**4. Commit:**
```sh
git add infra/main/dnssec.tf
git commit -m "feat(infra): DNSSEC signing"
```

#### C.5 Later: link to `.com` (after step 04 G, from 2026-12-03)

Don't do this now. Do it once **all** of these are true:
- Step 04 G is done: `lumineglyph.com` is registered in the `lumineglyph` account and managed by Terraform (`aws_route53domains_registered_domain.main` in `dns.tf`).
- The D alarms have been in place for at least a few days with no DNSSEC alerts.
- `aws route53 get-dnssec` still shows `SIGNING` with the KSK `ACTIVE`.

Then, on a new branch (`rebuild/08-dnssec-ds`):

**1. Add this to the end of `infra/main/dnssec.tf`:**
```hcl
# The chain of trust (step 08 C.5): publishes this zone's DS record in the .com registry, through the
# registration (dns.tf). From then on, validating resolvers check every answer's signature.
# Removing it is the FIRST step of turning DNSSEC off (step 08 "Undo DNSSEC"), never the last.
resource "aws_route53domains_delegation_signer_record" "main" {
  domain_name = var.domain

  signing_attributes {
    algorithm  = aws_route53_key_signing_key.main.signing_algorithm_type
    flags      = aws_route53_key_signing_key.main.flag
    public_key = aws_route53_key_signing_key.main.public_key
  }
}
```

**2. Plan.** Claude checks for **1 to add**, with `flags = 257` and the KSK's algorithm `13` (ECDSA P-256). Then apply.

**3. Check the chain**, after a few minutes (the registry takes a moment):
```sh
dig +short DS lumineglyph.com @a.gtld-servers.net               # one DS record
terraform -chdir=infra/main output -raw dnssec_ds_record         # the same values
dig +dnssec lumineglyph.com @1.1.1.1 | grep -E '^;; flags'       # includes "ad" (authenticated)
```
- [ ] https://dnsviz.net/d/lumineglyph.com/dnssec/ shows the chain `.` → `com` → `lumineglyph.com` without errors.
- [ ] The site, `www`, a preview and email all still work.

**4. Commit, PR, merge** (`feat(infra): DNSSEC chain of trust`). Claude updates PROGRESS.

#### Undo DNSSEC (runbook)

Never just delete `dnssec.tf`. The order matters:
1. **Remove the DS record first:** delete `aws_route53domains_delegation_signer_record.main`, then plan and apply.
2. **Wait at least 48 hours.** Resolvers may have cached the old DS record. The `.com` DS TTL is one day, so 48 hours is safe.
3. **Then stop signing:** set `signing_status = "NOT_SIGNING"` on `aws_route53_hosted_zone_dnssec.main`, then apply.
4. Only then set the KSK to `status = "INACTIVE"`, apply, and remove the KSK, the alias and the KMS key. The key's 30-day deletion window means even that can be cancelled.

Doing step 3 before steps 1–2 makes every validating resolver refuse the domain, so the site and email go offline. Step 09 copies this runbook into the README.

### D. Alarms

**1. Create `infra/main/alarms.tf`:**
```hcl
# Alarms (step 08 D). Route 53's DNSSEC metrics and CloudFront's metrics are only published in
# us-east-1, so the alarms and the topic they notify live there too.

# Alarm emails go to var.alert_email (the same address as the budget alerts). AWS sends a confirmation
# email once; nothing arrives until someone clicks its link.
resource "aws_sns_topic" "alerts" {
  #checkov:skip=CKV_AWS_26:CloudWatch can't publish to a topic encrypted with the AWS-managed key; a customer key costs $1/month, and alarm messages hold no secrets.
  region = "us-east-1"
  name   = "lumineglyph-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  region    = "us-east-1"
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# AWS recommends alarming on these two: either one means the zone may soon stop resolving.
resource "aws_cloudwatch_metric_alarm" "dnssec_internal_failure" {
  region              = "us-east-1"
  alarm_name          = "lumineglyph-dnssec-internal-failure"
  alarm_description   = "Route 53 couldn't sign ${var.domain}. Check the zone's DNSSEC signing status and the KMS key (step 08 C)."
  namespace           = "AWS/Route53"
  metric_name         = "DNSSECInternalFailure"
  dimensions          = { HostedZoneId = aws_route53_zone.main.zone_id }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "dnssec_ksk_needs_action" {
  region              = "us-east-1"
  alarm_name          = "lumineglyph-dnssec-ksk-needs-action"
  alarm_description   = "A DNSSEC key-signing key for ${var.domain} needs action, usually because the KMS key was disabled or its policy changed (step 08 C)."
  namespace           = "AWS/Route53"
  metric_name         = "DNSSECKeySigningKeysNeedingAction"
  dimensions          = { HostedZoneId = aws_route53_zone.main.zone_id }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# The live site returning server errors (5xx) for more than 5% of requests, 15 minutes in a row.
# The site only serves files from S3, so this would mean an S3 or CloudFront problem, not a bad deploy.
resource "aws_cloudwatch_metric_alarm" "site_5xx" {
  region              = "us-east-1"
  alarm_name          = "lumineglyph-site-5xx"
  alarm_description   = "lumineglyph.com is returning 5xx errors for more than 5% of requests."
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  dimensions          = { DistributionId = aws_cloudfront_distribution.site.id, Region = "Global" }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
```

**2. Plan:**
```sh
cd infra/main
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **5 to add**: the topic, the email subscription and three alarms, all in `us-east-1`. The email address shows as `(sensitive value)`.

```sh
terraform apply main.tfplan
rm main.tfplan
cd ../..
```

**3. Confirm the subscription.** AWS emails `alert_email` with the subject "AWS Notification - Subscription Confirmation". Click **Confirm subscription**. Then:
```sh
aws sns list-subscriptions-by-topic --region us-east-1 \
  --topic-arn "$(aws sns list-topics --region us-east-1 --query "Topics[?ends_with(TopicArn, ':lumineglyph-alerts')].TopicArn" --output text)" \
  --query 'Subscriptions[].SubscriptionArn' --output text
```
- [ ] A full ARN, not `PendingConfirmation`.

**4. Test an alarm.** This changes the alarm's state for a moment and sends one email. It doesn't touch the site:
```sh
aws cloudwatch set-alarm-state --region us-east-1 --alarm-name lumineglyph-site-5xx \
  --state-value ALARM --state-reason "Test from step 08 D.4"
```
- [ ] An email "ALARM: "lumineglyph-site-5xx"…" arrives within a minute. Within about 5 minutes the alarm checks the real metric, goes back to `OK`, and sends an "OK" email.

**5. Commit:**
```sh
git add infra/main/alarms.tf
git commit -m "feat(infra): DNSSEC and site alarms"
```

### E. Security checks in CI

A new `security` job runs on every PR and every push to `main`. It needs no AWS credentials. It checks:
- that Terraform is formatted and valid
- checkov on `infra/`
- zizmor on the workflows

The `build` job also gets the dark-mode accessibility check.

**1. Allow the Terraform setup action.** `PUT` replaces the whole list, so it repeats the two existing patterns:
```sh
gh api -X PUT repos/lumineglyph/lumineglyph/actions/permissions/selected-actions \
  -F github_owned_allowed=true \
  -F verified_allowed=false \
  -f 'patterns_allowed[]=lycheeverse/lychee-action@*' \
  -f 'patterns_allowed[]=aws-actions/configure-aws-credentials@*' \
  -f 'patterns_allowed[]=hashicorp/setup-terraform@*'

gh api repos/lumineglyph/lumineglyph/actions/permissions/selected-actions
```
- [ ] Three patterns, `github_owned_allowed` true, `verified_allowed` false.

**2. checkov settings.**

**a. Create `infra/.checkov.yaml`**, the findings accepted for the whole project, each with its reason:
```yaml
# checkov settings for infra/, used by the `security` job in .github/workflows/pipeline.yml (step 08 E).
#
# Each check skipped here is a decision for the whole project, with its reason. A skip that only
# applies to one resource is written inline in that resource instead (#checkov:skip=ID:reason).
# Before adding a skip here, ask whether it's really true for every resource the check covers.
framework:
  - terraform
compact: true
quiet: true
skip-download: true
skip-check:
  # S3 access logs (CKV_AWS_18) and CloudFront access logs (CKV_AWS_86): a log bucket and storage
  # for logs nobody reviews. CloudFront's built-in metrics and the alarms in alarms.tf cover what matters.
  - CKV_AWS_18
  - CKV_AWS_86
  # Cross-region replication of S3 (CKV_AWS_144): the site and previews are rebuilt from git in minutes,
  # and the state bucket is versioned. A second copy in another region isn't worth the cost.
  - CKV_AWS_144
  # S3 encryption with a KMS key (CKV_AWS_145): every bucket uses SSE-S3 (AES-256, AWS-managed keys).
  # A customer KMS key costs $1/month each and needs extra policy for CloudFront to read through it.
  - CKV_AWS_145
  # S3 event notifications (CKV2_AWS_62): nothing would consume them.
  - CKV2_AWS_62
  # AWS WAF on CloudFront (CKV_AWS_68, CKV2_AWS_47): a web ACL costs at least $5/month plus rules,
  # the whole budget. The site is static files with no forms, logins or server code to protect.
  - CKV_AWS_68
  - CKV2_AWS_47
  # CloudFront origin failover (CKV_AWS_310): one S3 origin; S3's own durability is enough here.
  - CKV_AWS_310
  # CloudFront geo restriction (CKV_AWS_374): the site is for visitors anywhere.
  - CKV_AWS_374
  # Route 53 query logging (CKV2_AWS_39): a CloudWatch log group billed per query, with nobody to read it.
  - CKV2_AWS_39
```

**b. Add one line to each of four existing resources**, as the **first line inside** the resource's `{`. These are choices that apply to one resource only.

In `infra/main/headers.tf`, inside **both** `resource "aws_cloudfront_response_headers_policy" "site" {` and `resource "aws_cloudfront_response_headers_policy" "previews" {`:
```hcl
  #checkov:skip=CKV_AWS_259:HSTS preload is left off on purpose: it is hard to undo (step 08 G decides it).
```
In `infra/main/previews.tf`, inside `resource "aws_s3_bucket" "previews" {`:
```hcl
  #checkov:skip=CKV_AWS_21:Previews are throwaway copies of a build; every push re-uploads them, so versioning would only keep junk.
```
In `infra/main/previews-cdn.tf`, inside `resource "aws_cloudfront_distribution" "previews" {`:
```hcl
  #checkov:skip=CKV_AWS_305:The viewer-request function maps every path, "/" included, to a pr-<N>/…/index.html key.
```
They're comments, so `terraform plan` shows no changes from them.

**c. Run checkov locally:**
```sh
uvx checkov@3.4.5 --config-file infra/.checkov.yaml -d infra
```
- [ ] The summary says `Failed checks: 0` (and `Skipped checks: 9`). Lines like `Failed to find context for resource…` are harmless warnings. If anything fails, show Claude; don't add a skip on your own.

**3. Pin the scanners.**

**a. Create `.github/scanners/requirements.txt`:**
```
# Security scanners for the `security` job in .github/workflows/pipeline.yml (step 08 E).
# Exact versions; Dependabot proposes updates (the pip entry in .github/dependabot.yml).
checkov==3.4.5
zizmor==1.32.0
```

**b. Add this to the end of `.github/dependabot.yml`**, after the Terraform entry, with the same two-space indent as the other `- package-ecosystem:` entries:
```yaml
  # scanners used by the security job
  - package-ecosystem: pip
    directory: /.github/scanners
    schedule:
      interval: weekly
    cooldown:
      default-days: 7
    commit-message:
      prefix: ci
```

**4. The accessibility check.**

**a. Install the two packages** (they go in `devDependencies`, like Lighthouse):
```sh
cd site
npm install --save-dev @axe-core/playwright@4.14.0 playwright-core@1.65.1
npm pkg set scripts.test:a11y="node tests/a11y.mjs"
```

**b. Create `site/tests/a11y.mjs`:**
```js
// Accessibility check of the built site (dist/) in both themes, at desktop and phone widths.
// Lighthouse in CI only sees the light theme, because the runner has no dark-mode setting.
// Here Playwright sets prefers-color-scheme for each run, and axe-core fails on any WCAG 2.2 A/AA violation.
// Uses the Chrome already installed on the machine (GitHub's Ubuntu runners have it), so nothing to download.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";
import { AxeBuilder } from "@axe-core/playwright";

const DIST = new URL("../dist/", import.meta.url).pathname;
const PAGES = ["/", "/en/", "/works/", "/en/works/", "/404.html"];
const THEMES = ["light", "dark"];
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".avif": "image/avif", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".png": "image/png", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain",
};

// A minimal static server for dist/: "/en/" serves "/en/index.html", like CloudFront does.
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ channel: "chrome" });
let failures = 0;
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  for (const colorScheme of THEMES) {
    const context = await browser.newContext({ viewport, colorScheme, reducedMotion: "reduce" });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(base + path, { waitUntil: "load" });
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const label = `${path} ${colorScheme} ${name}`;
      if (violations.length === 0) {
        console.log(`ok    ${label}`);
        continue;
      }
      failures += violations.length;
      console.log(`FAIL  ${label}`);
      for (const v of violations) {
        console.log(`      ${v.id} (${v.impact}): ${v.help}`);
        for (const node of v.nodes.slice(0, 3)) console.log(`        ${node.target.join(" ")}`);
      }
    }
    await context.close();
  }
}
await browser.close();
server.close();

if (failures > 0) {
  console.error(`\n${failures} accessibility violation(s).`);
  process.exit(1);
}
console.log("\nNo accessibility violations.");
```

**c. Run it locally:**
```sh
npm run build
npm run test:a11y
cd ..
```
- [ ] 20 `ok` lines and `No accessibility violations.`

**5. Add both checks to `.github/workflows/pipeline.yml`.**

**a. In the `build` job,** add this step right after the `Lighthouse` step and before `Upload the built site`. It uses the same six-space indent as the other steps:
```yaml
      # Lighthouse only sees the light theme. This loads every page in both themes, at desktop and
      # phone widths, and fails on any WCAG 2.2 A/AA violation axe-core finds (step 08 E).
      - name: Accessibility in both themes
        run: npm run test:a11y
```

**b. Add the `security` job at the very end of the file**, after `deploy-preview`. Leave one blank line before it. Its first line, `  security:`, starts with two spaces:
```yaml
  # Static checks of the infrastructure code and the workflows (step 08 E). No AWS access:
  # Terraform only formats and validates, and the scanners read files.
  security:
    name: security # required by the main ruleset, like build
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - name: Check out the repo
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Set up Terraform
        uses: hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e # v4.0.1
        with:
          terraform_version: 1.17.2
          terraform_wrapper: false # plain terraform output, no wrapper script

      - name: Terraform format
        run: terraform fmt -check -recursive -diff infra

      # -backend=false: no state, no AWS credentials. Providers are checked against the lock files.
      - name: Terraform validate
        run: |
          for stack in infra/bootstrap infra/main; do
            terraform -chdir="$stack" init -backend=false -input=false
            terraform -chdir="$stack" validate
          done

      # Versions pinned in .github/scanners/requirements.txt; Dependabot proposes updates.
      - name: Install the scanners
        run: |
          python3 -m venv "$RUNNER_TEMP/scanners"
          "$RUNNER_TEMP/scanners/bin/pip" install --quiet --disable-pip-version-check -r .github/scanners/requirements.txt
          echo "$RUNNER_TEMP/scanners/bin" >> "$GITHUB_PATH"

      # Accepted findings are listed with reasons in infra/.checkov.yaml, or inline in the .tf files.
      - name: Scan Terraform (checkov)
        run: checkov --config-file infra/.checkov.yaml -d infra

      - name: Scan workflows (zizmor)
        env:
          GH_TOKEN: ${{ github.token }} # online checks: pinned commits and known-vulnerable actions
        run: zizmor --format=github .github/workflows
```

**6. Check the workflows:**
```sh
uvx zizmor@1.32.0 .github/workflows/
GH_TOKEN=$(gh auth token) uvx zizmor@1.32.0 .github/workflows/
```
- [ ] Both end with `No findings to report. Good job!` Tell Claude **before committing**; Claude diffs every changed file against this step.

**7. Commit:**
```sh
git add infra/.checkov.yaml infra/main/headers.tf infra/main/previews.tf infra/main/previews-cdn.tf
git commit -m "chore(infra): checkov settings and accepted findings"
git add .github/scanners/requirements.txt .github/dependabot.yml site/package.json site/package-lock.json \
  site/tests/a11y.mjs .github/workflows/pipeline.yml
git commit -m "ci: security checks and accessibility in both themes"
```

### F. GitHub security settings

**1. Turn on CodeQL** (GitHub's code scanning, free for public repos). Default setup picks the languages itself: here, GitHub Actions and JavaScript/TypeScript:
```sh
gh api -X PATCH repos/lumineglyph/lumineglyph/code-scanning/default-setup \
  -f state=configured -f query_suite=default
sleep 60
gh api repos/lumineglyph/lumineglyph/code-scanning/default-setup --jq '{state, languages}'
gh run list --limit 3
```
- [ ] `"state":"configured"`, and a `CodeQL` run appears in the list. Let it finish, then:
```sh
gh run list --workflow CodeQL --limit 1
gh api repos/lumineglyph/lumineglyph/code-scanning/alerts --jq 'length'
```
- [ ] The run succeeded, and `0` alerts. If the run fails, or says actions must be pinned to a full SHA, tell Claude; that's the one untested point here. If there are alerts, show Claude before doing anything.

From now on CodeQL also runs on every PR and push to `main`, and weekly.

**2. Already on** (Claude checked): Dependabot alerts and security updates, secret scanning with push protection, and private vulnerability reporting.

**3. `SECURITY.md`.** Ask Claude to draft it ("draft SECURITY.md for step 08 F"). It covers:
- how to report a problem privately: the repo's **Security** tab → **Report a vulnerability**, not a public issue
- what's in scope (the site, the infrastructure code, the workflows)
- what to expect (an answer within a week; no bug bounty)

Review it, then:
```sh
git add SECURITY.md
git commit -m "docs: SECURITY.md"
```

### G. HSTS preload (not now)

Today the site sends `Strict-Transport-Security: max-age=63072000; includeSubDomains`. Browsers that have visited once use HTTPS for two years. **Preload** goes further: the domain is built into browsers, so even a first visit is HTTPS-only.

It's left off for now, because it's hard to undo:
- Once the domain is on the list, every subdomain must use HTTPS for the long term.
- Removal takes months, through browser releases.

checkov's HSTS rule (CKV_AWS_259) wants preload on; E.2 records that it's deliberately off.

**Later, if you decide to do it,** after a few weeks with no problems:
1. Set `preload = true` in **both** headers policies (`headers.tf`), and apply.
2. Submit `lumineglyph.com` at https://hstspreload.org.
3. Remove the two `CKV_AWS_259` skips.
4. Record the decision in PROGRESS either way.

### H. Push, PR, required check, merge

**1. Push and open the PR:**
```sh
git push -u origin rebuild/08-hardening
gh pr create --fill
gh pr checks --watch
```
- [ ] Green: `build` (now with "Accessibility in both themes"), `security`, `deploy-preview` and `CodeQL`.

**2. Look at the `security` job's log**, step by step:
```sh
RUN_ID=$(gh run list --workflow pipeline.yml --branch rebuild/08-hardening --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$RUN_ID" --log --job "$(gh run view "$RUN_ID" --json jobs --jq '.jobs[] | select(.name == "security") | .databaseId')" \
  | grep -E 'Success!|Passed checks|No findings'
```
- [ ] Two `Success! The configuration is valid.` lines, `Failed checks: 0`, and `No findings to report.`

Tell Claude. Claude reviews the PR.

**3. Make `security` a required check**, like `build`. This reads the ruleset, adds `security` next to `build`, and writes it back. Nothing else in the ruleset changes:
```sh
gh api repos/lumineglyph/lumineglyph/rulesets/27506455 \
  | jq '{rules: [.rules[] | if .type == "required_status_checks"
      then .parameters.required_status_checks += [{"context": "security", "integration_id": 15368}]
      else . end]}' \
  | gh api -X PUT repos/lumineglyph/lumineglyph/rulesets/27506455 --input - \
  | jq -c '.rules[] | select(.type == "required_status_checks") | .parameters.required_status_checks'
```
- [ ] `[{"context":"build",…},{"context":"security",…}]`. `15368` is GitHub Actions' app ID, the same as for `build`.

Do this only after `security` has passed on this PR. A required check that has never run leaves PRs waiting.

**4. Merge:**
```sh
gh pr merge --merge --delete-branch
git switch main && git pull
```
The merge deploys production as usual, now with `security` and CodeQL running on `main` too. Tell Claude when it's done.

## Checkpoint

**Claude checks:**
```sh
dig +short MX lumineglyph.com; dig +short TXT lumineglyph.com; dig +short TXT _dmarc.lumineglyph.com
dig +short CAA lumineglyph.com
dig +dnssec +norec SOA lumineglyph.com @ns-34.awsdns-04.com | grep RRSIG
aws route53 get-dnssec --hosted-zone-id Z00567272MES5QFM0F0BM
aws kms describe-key --region us-east-1 --key-id alias/lumineglyph-dnssec
aws cloudwatch describe-alarms --region us-east-1 --query 'MetricAlarms[].[AlarmName,StateValue]'
aws sns list-subscriptions-by-topic --region us-east-1 --topic-arn <alerts topic>
```
- The ruleset requires `build` and `security`; the Actions allowlist has the three patterns.
- The `main` run after the merge: `build`, `security` and `deploy-production` green.
- CodeQL `configured`, with no open alerts; Dependabot shows the new `pip` entry.
- `terraform plan`: no changes.
- Review: every checkov skip has a reason; no IAM change in this step; the DS record is **not** in the code yet.

**You check:**
- A.5: `hello@` reached both inboxes; `nobody@` bounced.
- D.4: the ALARM and OK emails arrived.
- MXToolbox (https://mxtoolbox.com/SuperTool.aspx): `dmarc:lumineglyph.com` shows `p=reject`, and `spf:lumineglyph.com` passes.
- https://dnsviz.net/d/lumineglyph.com/dnssec/ shows `lumineglyph.com` signed (DNSKEY and RRSIG). Until C.5, the link from `com` is missing, which is expected.

PROGRESS gets:
- the ImprovMX setup (no addresses)
- the KMS key ARN and the KSK's key tag
- the alarm names
- the CodeQL state
- C.5 recorded as waiting for 04 G

## Commit

- Before you start: `docs(rebuild): step 08 instructions`
- A.6: `feat(infra): email forwarding and anti-spoofing records`
- B.3: `feat(infra): CAA record`
- C.4: `feat(infra): DNSSEC signing`
- D.5: `feat(infra): DNSSEC and site alarms`
- E.7: `chore(infra): checkov settings and accepted findings`, then `ci: security checks and accessibility in both themes`
- F.3: `docs: SECURITY.md`

All merged through the PR in H. C.5 is a separate PR after step 04 G. After the checkpoint, Claude's PROGRESS update goes through a small PR, as in steps 06 and 07.

## Notes for Claude

- Never run `apply`, `gh api -X PUT/PATCH`, `aws cloudwatch set-alarm-state`, merges or git writes. Never sign up for or change ImprovMX. Run `plan`, `dig`, read-only `aws`/`gh api`, checkov and zizmor freely.
- **Never put the destination email addresses in the repo**, in PROGRESS, or in a PR. They live only in ImprovMX.
- **DNSSEC:** before C.5, re-read the Route 53 "enable signing" and "disable" docs and check that `aws route53 get-dnssec` is `SIGNING` with no `DNSSECKeySigningKeysNeedingAction`. After C.5, if anything fails to resolve, the first check is `dig +cd` (checking disabled) versus a normal `dig` against `1.1.1.1`: if only the normal one fails, it's DNSSEC. The fix is the runbook's order, never "turn signing off" first.
- **A new checkov finding in a later PR:** fix it if it's real. Only accept it with a reason if it's a deliberate choice: inline for one resource, in `infra/.checkov.yaml` only if it's true for the whole project. Don't skip without Matthew's agreement.
- **The accessibility check fails in CI but passes locally:** check that the runner image still has Google Chrome (`channel: "chrome"`). If GitHub ever removes it, the fallback is `npx playwright-core install chromium` and `chromium.launch()` without a channel.
- **CodeQL fails because of the SHA-pinning setting:** report it before changing any repo setting. Options are an exception, or the "advanced setup" workflow with pinned actions; let Matthew choose.
- **SPF and DMARC:** if replying as `hello@` is ever set up (ImprovMX paid SMTP), its DKIM record must be in place before any mail is sent, or DMARC's `p=reject` will reject it.
- Verified 2026-11-22: the zone's records; ImprovMX's records and free plan; ACM's CAA names; the DNSSEC docs (key policy, KSK, metrics); `terraform validate` of A–D and C.5 (also without credentials); checkov 3.4.5 (169 passed, 0 failed); the accessibility check (passes; fails on an injected dark-mode bug); `astro check` with it; zizmor 1.32.0 (offline, online, pedantic); scanners installing from `requirements.txt` on Python 3.12; the ruleset change as a dry run; the security settings already on.
