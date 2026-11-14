# 04 — AWS foundation: Terraform state, domain, DNS zone, certificate

## Goal

- A Terraform state bucket that you bootstrap yourself.
- An `infra/main` stack with a remote backend.
- `lumineglyph.com` registered, with its hosted zone managed by Terraform.
- A validated TLS certificate in `us-east-1` covering the apex, `www` and `*.preview`.
- A budget alarm.

## Why it matters

- **The "chicken and egg" of Terraform state.** The bucket that stores Terraform's state can't be created by the stack that uses it. Solving that is a classic interview topic.
- **The domain is in code.** Name servers, auto-renew and transfer lock are all Terraform settings.
- **Spending guardrails** before anything can cost money.

## Steps

### A. Bootstrap the state bucket (`infra/bootstrap/`)

1. Write a small stack: AWS provider in `ap-northeast-1`, and an S3 bucket for state.
   - **Bucket name:** something like `lumineglyph-tfstate-<random suffix>`. Bucket names are global, so they can collide.
   - **Settings:**
     - versioning enabled, so you can recover corrupted state
     - default encryption SSE-S3
     - all four Block Public Access settings on
     - object ownership `BucketOwnerEnforced`
   - **Bucket policy** that denies any request not made over TLS:
     ```hcl
     statement {
       sid       = "DenyInsecureTransport"
       effect    = "Deny"
       actions   = ["s3:*"]
       resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
       principals {
         type        = "*"
         identifiers = ["*"]
       }
       condition {
         test     = "Bool"
         variable = "aws:SecureTransport"
         values   = ["false"]
       }
     }
     ```
   - Add `lifecycle { prevent_destroy = true }` on the bucket.
2. Run `terraform init`, then `terraform apply`. This first run keeps its state in a local file.
3. **Move the bootstrap stack's own state into the bucket it just created.** Add a backend block:
   ```hcl
   terraform {
     backend "s3" {
       bucket       = "lumineglyph-tfstate-xxxx"
       key          = "bootstrap/terraform.tfstate"
       region       = "ap-northeast-1"
       encrypt      = true
       use_lockfile = true      # S3-native locking (Terraform ≥1.10); no DynamoDB table needed
     }
   }
   ```
   Then run `terraform init -migrate-state` and delete the local `terraform.tfstate*` files.
4. Commit `.terraform.lock.hcl`, which pins provider checksums. Ignore `.terraform/`, `*.tfstate*` and `*.tfvars` if they contain anything personal.

### B. Main stack skeleton (`infra/main/`)

Suggested files:

| File | Contents |
|------|----------|
| `versions.tf` | `required_version >= 1.10`, `hashicorp/aws ~> 6.73`, backend with `key = "main/terraform.tfstate"` |
| `providers.tf` | `provider "aws" { region = "ap-northeast-1"  default_tags { tags = { Project = "lumineglyph", ManagedBy = "terraform" } } }` |
| `variables.tf` | `domain` (default `lumineglyph.com`), `github_repo` (used in step 06), `alert_email` |
| `dns.tf`, `cert.tf`, `budget.tf` | this step |
| `site.tf`, `previews.tf`, `github-oidc.tf` | later steps |

**Multi-region without provider aliases.** AWS provider v6 lets you set `region` on an individual resource. The certificate and (in step 08) the DNSSEC key go in `us-east-1` like this:

```hcl
resource "aws_acm_certificate" "site" {
  region                    = "us-east-1"   # CloudFront only accepts certificates from us-east-1
  domain_name               = var.domain
  subject_alternative_names = ["www.${var.domain}", "*.preview.${var.domain}"]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}
```

Add Terraform to Dependabot (`package-ecosystem: terraform`, `directory: /infra/main`, monthly, with a cooldown).

### C. Budget

`budget.tf`: an `aws_budgets_budget` with a monthly cost limit of about $5. Add notifications to `var.alert_email` at 80% of actual spend and 100% of forecasted spend.

**Expected running cost:**

| Item | Cost |
|------|------|
| Hosted zone | $0.50/month |
| DNSSEC KMS key (step 08) | $1/month |
| CloudFront and S3 at this traffic | a few cents |
| Domain | about $15/year |

### D. Register the domain

**Route 53 (recommended):**
1. Buy it in the console: Route 53 → Registered domains → Register. Keep contact privacy on and auto-renew on. A purchase isn't something to do with `terraform apply`.
2. Route 53 automatically creates a hosted zone for the domain. Bring that zone under Terraform with an `import` block:
   ```hcl
   import {
     to = aws_route53_zone.main
     id = "Z0123456789ABCDEF"     # from: aws route53 list-hosted-zones-by-name --dns-name lumineglyph.com
   }
   resource "aws_route53_zone" "main" {
     name = var.domain
   }
   ```
3. Manage the registration itself with `aws_route53domains_registered_domain`:
   - `auto_renew = true`
   - `transfer_lock = true`
   - one `name_server` block per name server in `aws_route53_zone.main.name_servers`

   This resource takes over an existing registration; it doesn't buy anything. **(verify)** the arguments in the provider docs.

**Namecheap (alternative):**
1. Buy the domain at Namecheap.
2. Create `aws_route53_zone.main` with Terraform.
3. In Namecheap → Domain → Nameservers → Custom DNS, enter the zone's four name servers.

Record in PROGRESS that the name server delegation (and later the DS record) is a manual step.

### E. Certificate validation

ACM proves you own the domain by checking DNS records it asks you to create. Create those records in Route 53 and wait for validation:

```hcl
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for o in aws_acm_certificate.site.domain_validation_options : o.domain_name => o
  }
  zone_id         = aws_route53_zone.main.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  region                  = "us-east-1"
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
```

## Checkpoint

Claude runs read-only checks:
- `terraform -chdir=infra/main plan` shows no changes after your apply.
- `aws s3api get-bucket-policy`, `get-bucket-versioning` and `get-public-access-block` on the state bucket.
- `dig NS lumineglyph.com +short` returns the Route 53 name servers. Delegation can take minutes to hours.
- `aws acm describe-certificate --region us-east-1 --certificate-arn …` shows the status `ISSUED`.
- `aws budgets describe-budgets --account-id …` shows the budget.

PROGRESS gets the state bucket name, hosted zone ID and registrar details.

## Commit

`feat(infra): bootstrap state bucket`, then `feat(infra): domain, hosted zone, certificate, budget`.

## ADR

Write `docs/adr/003-aws-hosting.md`. Cover:
- S3 + CloudFront + Route 53 rather than Netlify, Vercel or Cloudflare Pages
- why Terraform
- why Tokyo plus `us-east-1`
- the trade-off: more moving parts in exchange for owning the whole stack

## Notes for Claude

- Never run `apply`. Run `plan` freely.
- If the plan wants to replace the imported hosted zone, stop: an attribute doesn't match the real zone, such as `comment` or `force_destroy`. Replacing the zone would change the name servers and break delegation.
- `use_lockfile` replaces DynamoDB-based locking. Don't suggest a lock table.
