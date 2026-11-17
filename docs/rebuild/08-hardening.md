# 08 — Hardening: DNS, DNSSEC, alarms, scanners

## Goal

- DNS that stops others from spoofing email as the domain or getting certificates issued for it.
- DNSSEC signing with a chain of trust from `.com`.
- Alarms for the failures that matter.
- Automated security scanning of the workflows and the Terraform code.

## Why it matters

Most small sites skip these steps. They're cheap, quick and easy to check, which makes them good portfolio material. They also protect a business domain from real abuse.

## Steps

### A. Email anti-spoofing

**First decide: will you use email at `@lumineglyph.com`?** Check the open question in PROGRESS.

- **No email (for now).** Publish records that say "this domain sends no mail". Then anyone forging `@lumineglyph.com` gets rejected:

  | Name | Type | Value |
  |------|------|-------|
  | `lumineglyph.com` | MX | `0 .` (null MX, RFC 7505: accepts no mail) |
  | `lumineglyph.com` | TXT | `"v=spf1 -all"` |
  | `_dmarc.lumineglyph.com` | TXT | `"v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s"` |

- **Forwarding only** (the recommended starting point, $0). A service like ImprovMX or Forward Email receives mail for `hello@lumineglyph.com` and forwards it to your existing inboxes. It works with Route 53 DNS. Cloudflare's free forwarding would require moving DNS to Cloudflare.
  - Records: the service's MX records, plus an SPF `include:` if you'll send through it.
  - Free plans only receive. To *reply as* `hello@`, you need a paid tier with SMTP (Forward Email from about $3/month).
- **Real mailboxes** (Google Workspace, Fastmail, iCloud custom domain, and so on).
  - Use the provider's MX, SPF `include:` and DKIM records.
  - Start DMARC at `p=none` with reporting. Tighten it to `quarantine`, then `reject`, once the reports look clean.
  - Google Workspace Business Starter was about $7 per user per month on an annual plan as of late 2026.

Put any apex TXT values in **one** `aws_route53_record` with several `records` entries. Route 53 allows one record set per name and type.

### B. CAA

CAA records list which certificate authorities may issue certificates for the domain:

```hcl
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

ACM documents all four of these names. **(verify)** the list against the ACM docs. With no `issuewild` record, wildcard certificates follow the same `issue` list.

### C. DNSSEC

**Warning: a broken DNSSEC setup takes the whole domain offline.** Do it in two separate applies, and verify in between.

**Apply 1: sign the zone.**
- `aws_kms_key` with:
  - `region = "us-east-1"`
  - `customer_master_key_spec = "ECC_NIST_P256"`
  - `key_usage = "SIGN_VERIFY"`
  - a key policy that lets `dnssec-route53.amazonaws.com` use it. Copy the policy from the example in the `aws_route53_key_signing_key` registry docs rather than writing it from memory.
- `aws_route53_key_signing_key`, using that key.
- `aws_route53_hosted_zone_dnssec`, with `depends_on` the signing key.
- Verify: `dig +dnssec lumineglyph.com SOA` shows `RRSIG` records. Wait at least the zone's longest TTL before going on.

**Apply 2: link the chain of trust to `.com`.**
- **Route 53 registrar:** `aws_route53domains_delegation_signer_record`, with `signing_attributes` taken from the signing key's `signing_algorithm_type`, `flag` and `public_key`. **(verify)** the attribute names.
- **Namecheap:** take the DS record values from `aws route53 get-dnssec --hosted-zone-id …` and enter them by hand under Advanced DNS → DNSSEC.
- Verify: https://dnsviz.net/d/lumineglyph.com/dnssec/ shows a green chain. `dig +dnssec lumineglyph.com` through a validating resolver (`@1.1.1.1`) has the `ad` flag.

**To undo** (write this in the README runbook): remove the DS record at the parent first, wait for its TTL (up to 48 hours to be safe), and only then turn off signing. Doing it in the other order breaks the domain.

### D. Alarms

- An SNS topic in `us-east-1` with an email subscription to `var.alert_email`. You have to confirm the subscription email once.
- CloudWatch alarms, all in `us-east-1`:

  | Namespace | Metric | Dimensions | Alert when |
  |-----------|--------|------------|------------|
  | `AWS/Route53` | `DNSSECInternalFailure` | `HostedZoneId` | > 0 |
  | `AWS/Route53` | `DNSSECKeySigningKeysNeedingAction` | `HostedZoneId` | > 0 |
  | `AWS/CloudFront` | `5xxErrorRate` | `DistributionId`, `Region=Global` | above about 5% for 15 minutes |

- Each alarm costs about $0.10/month.

### E. Scanners in CI

Add an `infra-checks` job (or a separate workflow that only runs when `infra/**` or `.github/**` changes). It needs no AWS credentials:

```sh
terraform fmt -check -recursive infra
terraform -chdir=infra/main init -backend=false && terraform -chdir=infra/main validate
trivy config infra/          # or checkov; misconfiguration scanning
zizmor .github/workflows     # GitHub Actions security lint
```

- Pin any scanner actions by SHA, like everything else. Security tools' own actions have been targets of supply-chain attacks.
- **Accessibility in both themes.** Lighthouse in CI (step 03) only checks the light theme, because the runner has no dark-mode setting. Add an axe check that loads each page with `prefers-color-scheme` set explicitly to light and to dark, for example `@axe-core/playwright` with Playwright's `colorScheme` option, and fails on any WCAG 2.2 AA violation. Unlike Lighthouse's score, this check gives the same result every run.
- If a scanner flags something you've decided to accept (for example, "S3 bucket has no access logging" for previews), suppress it inline with a comment saying why. Don't turn the rule off globally.

Also enable in GitHub settings:
- **Code security → CodeQL default setup** (JavaScript/TypeScript and Actions)
- **Dependabot alerts**
- **Private vulnerability reporting**

Add a short `SECURITY.md` explaining how to report a problem.

### F. HSTS preload (optional, do it last)

Only after everything has run cleanly for a few weeks:
1. Set `preload = true` in the headers policy.
2. Submit the domain at hstspreload.org.

Once a domain is on browsers' preload lists, every subdomain must use HTTPS for the long term, and removal takes months. Record the decision either way.

## Checkpoint

Claude runs:
```sh
dig +short MX lumineglyph.com; dig +short TXT lumineglyph.com; dig +short TXT _dmarc.lumineglyph.com
dig +short CAA lumineglyph.com
dig +dnssec lumineglyph.com @1.1.1.1 | grep -E 'flags|RRSIG'
aws cloudwatch describe-alarms --region us-east-1 --query 'MetricAlarms[].AlarmName'
```

You check:
- DNSViz shows green.
- An email-security checker (for example, MXToolbox's DMARC lookup) shows the expected policy.
- The `infra-checks` job is green.

## Commit

`feat(infra): CAA and anti-spoofing DNS records`, `feat(infra): DNSSEC signing`, `feat(infra): alarms`, `ci: terraform and workflow security checks`.
