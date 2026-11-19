# 04 — AWS foundation: Terraform state, budget, domain, DNS zone, certificate

## Goal

- An S3 bucket that holds Terraform's state, created by a small `infra/bootstrap` stack.
- An `infra/main` stack that keeps its state in that bucket.
- A budget that emails you before AWS costs get out of hand.
- `lumineglyph.com` registered with Route 53, with its hosted zone and registration settings managed by Terraform. Since 2026-11-19 this happens in two stages: the zone in D, and the registration in G, 14+ days later (see D).
- A validated TLS certificate in `us-east-1` covering `lumineglyph.com`, `www.lumineglyph.com` and `*.preview.lumineglyph.com`. Step 05 attaches it to CloudFront.

## Why it matters

- **The "chicken and egg" of Terraform state.** Terraform records what it created in a state file. A team keeps that file in a shared, versioned, locked bucket. But the bucket can't be created by the stack that stores its state in it. The usual fix is a tiny bootstrap stack that creates the bucket and then moves its own state into it. That fix is the first thing you build here.
- **The domain is in code.** Its name servers, auto-renew and transfer lock are Terraform settings, not clicks someone has to remember.
- **Spending guardrails** go in before anything can cost money.

## How this step works

- **You run every `terraform apply`** and buy the domain yourself. Claude never runs `apply`.
- **Claude runs `terraform plan`** after each change and reads the result with you before you apply. Plans only read.
- **Terraform runs on your machine, with your SSO login.** CI doesn't touch AWS until step 06.
- **Real AWS is the reference.** The checks at the end query AWS and DNS directly.

**What it costs:** the bootstrap bucket costs a few cents a year. The hosted zone is $0.50/month. The domain is $16/year, charged when you buy it. Budgets are free.

## What Claude already checked (2026-11-18)

- **Versions:** Terraform 1.17.0 is installed (1.17.2 is the latest; either works). The AWS provider is at 6.73.0, which has been out for 7 days, matching the 7-day Dependabot wait from step 03.
- **Provider docs at v6.73.0:**
  - `aws_acm_certificate` and `aws_acm_certificate_validation` take a per-resource `region`, so the `us-east-1` certificate needs no second provider.
  - `aws_route53domains_registered_domain` has no `region` argument; the provider handles that. It *adopts* a domain you've already registered rather than buying one, and `terraform destroy` never deletes the domain.
  - Its contact details (name, address, phone) are optional, and privacy defaults to on. **The contacts stay out of the code**, because the repo is public.
  - `aws_route53_zone`'s `comment` defaults to "Managed by Terraform". (This mattered when D imported the zone that Route 53 creates with the domain. Since 2026-11-19, Terraform creates the zone itself and sets its own comment.)
- **Not checked yet:** anything inside your AWS account. Your SSO login had expired. "Before you start" has you log in and run the account checks.

## Before you start

**1. Finish the Dependabot fix from step 03** (the `ignore` block for TypeScript 7, and closing PR #2), if you haven't. This step edits the same `dependabot.yml`.

**2. Branch:**
```sh
cd ~/code/ged/lumineglyph
git switch main && git pull
git switch -c rebuild/04-aws-foundation
```

**3. Log in to AWS** and point Terraform at the profile. Do this in every new terminal you use for this step:
```sh
aws sso login --profile lumineglyph
export AWS_PROFILE=lumineglyph
aws sts get-caller-identity
```
- [ ] The `Arn` contains `assumed-role/AWSReservedSSO_AdministratorAccess_`. That means you're using a short-lived SSO role, not an IAM user.

The profile comes from the environment variable, not from the Terraform code. That way the code stays the same when CI runs it with its own credentials later.

**4. Check the domain and price** (read-only):
```sh
aws route53domains check-domain-availability --domain-name lumineglyph.com --region us-east-1
aws route53domains list-prices --tld com --region us-east-1 --query 'Prices[0].[RegistrationPrice,RenewalPrice]'
```
- [ ] `"Availability": "AVAILABLE"`
- [ ] Both prices are about 16 USD.

**5. Tell Claude you're logged in.** Claude then checks the account, all read-only:
- no existing hosted zones or budgets that would clash
- the account can create budgets (some organization setups block this for member accounts)
- no domains registered yet

### 0. A dedicated AWS account for Lumineglyph (added 2026-11-18)

Step 5 showed that the `lumineglyph` profile was logging into the Organization's **management account** (`658606186432`, "Ged Miner"). That account also pays for `workloads-dev` and `beer-platform-workload`. Lumineglyph gets its own member account, for three reasons:
- **The budget only counts Lumineglyph.** In the management account, a budget counts spending from every account in the Organization.
- **Security.** The GitHub deploy role (step 06) doesn't sit next to the Organization's controls, and service control policies (SCPs) can restrict the account later. They never apply to the management account.
- **Nothing to move.** The domain, state and certificate are created in the right place from the start.

Your organization already has these set up, so this section only uses them:
- IAM Identity Center instance `ssoins-7758215773b460ff` in `ap-northeast-1`
- permission set `AdministratorAccess` (`ps-7758566bb986fae2`)
- your SSO user `ged_miner` (`9734fa58-f051-70d9-d23e-9186974be0a2`)
- **centralized root access**. Because it's on, new member accounts are created with no root password, no root access keys and no root MFA, so there's no root user to secure.

Every command here changes something, so you run them all. Claude checks the result at the end.

**1. Add a profile for the management account.** You'll still need it for Organization-level work, such as this section. Open `~/.aws/config` and add this block under the existing `[profile lumineglyph]` block:
```ini
[profile ged-management]
sso_session = lumineglyph
sso_account_id = 658606186432
sso_role_name = AdministratorAccess
region = ap-northeast-1
output = json
```
It reuses the same SSO login (the `sso_session` name stays `lumineglyph`). Check it:
```sh
aws sts get-caller-identity --profile ged-management
```
- [ ] `"Account": "658606186432"`.

**2. Create the account.** The email must be one that no other AWS account uses. A Gmail `+` address works and still arrives in your inbox: replace `you+aws-lumineglyph@example.com` below with your own address plus `+aws-lumineglyph`. AWS sends account notices there. With root credentials off, nobody signs in with it. Don't commit the real address anywhere.
```sh
aws organizations create-account --profile ged-management \
  --account-name lumineglyph \
  --email 'you+aws-lumineglyph@example.com' \
  --tags Key=Project,Value=lumineglyph \
  --query 'CreateAccountStatus.Id' --output text
```
It prints a request ID starting with `car-`. Creating the account takes about a minute. Check:
```sh
aws organizations describe-create-account-status --profile ged-management \
  --create-account-request-id car-PASTE_THE_ID \
  --query 'CreateAccountStatus.[State,AccountId,FailureReason]' --output text
```
- [ ] `SUCCEEDED` followed by a 12-digit account ID. Note the ID; it's `NEW_ACCOUNT_ID` below. If it says `IN_PROGRESS`, wait 30 seconds and run it again.

AWS also creates a role in the new account called `OrganizationAccountAccessRole`. Admins of the management account can use it to get into the new account if SSO ever breaks. Keep it.

**3. Give your SSO user `AdministratorAccess` in the new account.** Replace `NEW_ACCOUNT_ID`:
```sh
aws sso-admin create-account-assignment --profile ged-management \
  --instance-arn arn:aws:sso:::instance/ssoins-7758215773b460ff \
  --target-type AWS_ACCOUNT --target-id NEW_ACCOUNT_ID \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-7758215773b460ff/ps-7758566bb986fae2 \
  --principal-type USER --principal-id 9734fa58-f051-70d9-d23e-9186974be0a2 \
  --query 'AccountAssignmentCreationStatus.[Status,RequestId]' --output text
```
It prints `IN_PROGRESS` and a request ID. After a few seconds:
```sh
aws sso-admin describe-account-assignment-creation-status --profile ged-management \
  --instance-arn arn:aws:sso:::instance/ssoins-7758215773b460ff \
  --account-assignment-creation-request-id PASTE_THE_REQUEST_ID \
  --query 'AccountAssignmentCreationStatus.[Status,FailureReason]' --output text
```
- [ ] `SUCCEEDED`.

**4. Point the `lumineglyph` profile at the new account:**
```sh
aws configure set sso_account_id NEW_ACCOUNT_ID --profile lumineglyph
export AWS_PROFILE=lumineglyph
aws sts get-caller-identity
```
- [ ] `"Account"` is the new ID, and the `Arn` still contains `assumed-role/AWSReservedSSO_AdministratorAccess_`. If you get an error about the role or access, run `aws sso login --profile lumineglyph` once and try again.

From now on `AWS_PROFILE=lumineglyph` means the Lumineglyph account. Everything in A–F goes there. Use `--profile ged-management` only for Organization or billing work.

**5. Check root access in the console** (read-only). Open the AWS console with the management account, then IAM → **Root access management**.
- [ ] The `lumineglyph` account shows no root user credentials **(verify the exact wording)**.

**6. Tell Claude.** Claude runs the "Before you start" step 5 checks again, this time in the new account:
- the domain is available
- there are no hosted zones, registered domains or budgets
- the account can create budgets. A brand-new account can take a while for some services to activate; if one says the account isn't ready, wait and try again.

Claude also records the account ID and both profiles in PROGRESS. Nothing here is committed: the account and SSO settings live in AWS and in your `~/.aws/config`, not in the repo.

The management account's `org-monthly-total` budget ($20/month) stays as it is. It still covers the whole Organization, including the new account.

### A. Bootstrap the state bucket (`infra/bootstrap/`)

**1. Pick the bucket name.** S3 bucket names are global across all AWS customers, so add a random suffix:
```sh
echo "lumineglyph-tfstate-$(openssl rand -hex 3)"
```
Note the result, for example `lumineglyph-tfstate-a1b2c3`. It goes in two places below and in PROGRESS. It isn't secret.

**2. Create `infra/.gitignore`:**
```gitignore
# Provider downloads and local working files
.terraform/
crash.log

# State files. State lives in S3; a local copy only exists briefly during the bootstrap.
*.tfstate
*.tfstate.*

# Saved plans (terraform plan -out). They hold every value in plain text, sensitive ones included.
*.tfplan

# Variable values can be personal (the alert email). Commit *.tfvars.example instead.
*.tfvars
```
`.terraform.lock.hcl` is **not** ignored. It pins the exact provider versions and checksums, like `package-lock.json`.

**3. Create `infra/bootstrap/main.tf`.** Replace `lumineglyph-tfstate-a1b2c3` with your name from A.1.
```hcl
# Creates the S3 bucket that holds Terraform state for every stack in this repo.
# Run once by hand. Its own state is then moved into the bucket (step 04 A.5).

terraform {
  required_version = ">= 1.10" # use_lockfile (S3-native state locking) needs 1.10+

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.73"
    }
  }
}

provider "aws" {
  region = "ap-northeast-1"

  default_tags {
    tags = {
      Project   = "lumineglyph"
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}

resource "aws_s3_bucket" "state" {
  bucket = "lumineglyph-tfstate-a1b2c3"

  # Losing this bucket loses track of every resource Terraform manages.
  lifecycle {
    prevent_destroy = true
  }
}

# Every state write keeps the previous version, so a bad write can be rolled back.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Old versions are kept for 90 days, then deleted.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.state]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256" # SSE-S3
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ACLs off: access is controlled by IAM and the bucket policy only.
resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Refuse any request that isn't over HTTPS.
data "aws_iam_policy_document" "state" {
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
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state.json

  # Applying the policy while Block Public Access is still being set can fail; do it after.
  depends_on = [aws_s3_bucket_public_access_block.state]
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}
```

**4. Create the bucket.** This first run keeps its state in a local file, `infra/bootstrap/terraform.tfstate`, which is git-ignored.
```sh
cd infra/bootstrap
terraform init
terraform fmt
terraform validate
terraform plan -out=bootstrap.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude runs its own `terraform plan` and checks for **7 to add, 0 to change, 0 to destroy**: the bucket, versioning, lifecycle, encryption, public access block, ownership controls and policy.

Then apply exactly that plan. A saved plan doesn't record which AWS account it was made for. `apply` uses whatever credentials the terminal has at that moment, so check the account first:
```sh
aws sts get-caller-identity --query Account --output text   # must be the lumineglyph account, 421803180949
terraform apply bootstrap.tfplan
rm bootstrap.tfplan
```
- [ ] It ends with `Apply complete! Resources: 7 added` and prints `state_bucket`.

**5. Move the bootstrap stack's own state into the bucket.** Add this block inside the `terraform { … }` block in `main.tf`, under `required_providers`, with your bucket name:
```hcl
  # Added after the first apply: this stack's state now lives in the bucket it created.
  backend "s3" {
    bucket       = "lumineglyph-tfstate-a1b2c3"
    key          = "bootstrap/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true # S3-native locking; no DynamoDB table needed
  }
```
Then:
```sh
terraform init -migrate-state
```
It asks "Do you want to copy existing state to the new backend?" Answer `yes`.
```sh
terraform plan                      # expect: No changes. Your infrastructure matches the configuration.
aws s3 ls s3://lumineglyph-tfstate-a1b2c3/bootstrap/
rm terraform.tfstate terraform.tfstate.backup
cd ../..
```
- [ ] `plan` says **No changes**, and `aws s3 ls` lists `terraform.tfstate`.

Only delete the local files after both of those checks pass. Until then they're your only copy of the state.

**6. Commit:**
```sh
git add infra/.gitignore infra/bootstrap/main.tf infra/bootstrap/.terraform.lock.hcl
git status                          # only those three files staged; no .tfstate, no .terraform/
git commit -m "feat(infra): bootstrap state bucket"
```

### B. Main stack and budget (`infra/main/`)

**1. Create `infra/main/versions.tf`** with your bucket name:
```hcl
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.73"
    }
  }

  backend "s3" {
    bucket       = "lumineglyph-tfstate-a1b2c3"
    key          = "main/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
```

**2. Create `infra/main/providers.tf`:**
```hcl
# Tokyo by default; resources that must live elsewhere (the CloudFront certificate) set their own `region`.
provider "aws" {
  region = "ap-northeast-1"

  default_tags {
    tags = {
      Project   = "lumineglyph"
      ManagedBy = "terraform"
      Stack     = "main"
    }
  }
}
```

**3. Create `infra/main/variables.tf`:**
```hcl
variable "domain" {
  description = "The site's apex domain."
  type        = string
  default     = "lumineglyph.com"
}

variable "alert_email" {
  description = "Where budget (and, from step 08, alarm) emails go. Set in terraform.tfvars, which is git-ignored."
  type        = string
  sensitive   = true # kept out of plan output, which may be pasted into PRs
}
```

**4. Give the email a value.** Create `infra/main/terraform.tfvars`, which is git-ignored, with the address that should receive alerts:
```hcl
alert_email = "you@example.com"
```
Also create `infra/main/terraform.tfvars.example`, which **is** committed, so others can see what's expected:
```hcl
# Copy to terraform.tfvars (git-ignored) and fill in.
alert_email = "you@example.com"
```

**5. Create `infra/main/budget.tf`:**
```hcl
# Emails alert_email when the month's spend looks high. Expected spend is under $1/month,
# except in the month the domain is bought or renewed ($16), when the "actual" alert will fire.
resource "aws_budgets_budget" "monthly" {
  name         = "lumineglyph-monthly"
  budget_type  = "COST"
  limit_amount = "5"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Actual spend passed $4
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  # AWS forecasts the month will end above $5
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}
```

**6. Plan and apply:**
```sh
cd infra/main
terraform init
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **1 to add**, the budget.
```sh
terraform apply main.tfplan
rm main.tfplan
cd ../..
```

**7. Commit:**
```sh
git add infra/main/versions.tf infra/main/providers.tf infra/main/variables.tf infra/main/budget.tf infra/main/terraform.tfvars.example infra/main/.terraform.lock.hcl
git status                          # terraform.tfvars must NOT be listed
git commit -m "feat(infra): main stack and monthly budget"
```

### C. Dependabot for Terraform

Add a third entry to the end of `.github/dependabot.yml`, replacing the `# terraform is added in step 04` comment:
```yaml
  - package-ecosystem: terraform
    directories:
      - /infra/bootstrap
      - /infra/main
    schedule:
      interval: weekly
    cooldown:
      default-days: 7
    commit-message:
      prefix: chore
      include: scope
```
Dependabot then proposes AWS provider updates by changing `.terraform.lock.hcl` and, when needed, the version constraint.

```sh
git add .github/dependabot.yml
git commit -m "chore: dependabot for terraform"
```

### D. Hosted zone and domain (rewritten 2026-11-19)

**Why D changed.** Route 53 Domains doesn't work yet in the new `lumineglyph` account. For over 24 hours it answered `DONT_KNOW` for every domain, even `google.com`, while the management account and `workloads-dev` answered `AVAILABLE`. A support case is open. So that the rebuild can continue:
- the **domain is bought in the management account**
- the **hosted zone is created by Terraform in the `lumineglyph` account**
- the domain's name servers are pointed at that zone by hand, once

A domain and its hosted zone can be in different AWS accounts without affecting the domain or DNS. AWS doesn't allow moving a domain to another AWS account in its first 14 days, so **part G** moves the registration into `lumineglyph` later and brings it under Terraform.

Use two kinds of commands in this part:
- **`lumineglyph` account (the default):** `export AWS_PROFILE=lumineglyph` in your terminal. `terraform` always uses this.
- **Management account:** add `--profile ged-management` to that one `aws` command. Every command below that needs it already has it.

**1. Create the hosted zone in the `lumineglyph` account.** This works before the domain is bought. Create `infra/main/dns.tf`:
```hcl
# The site's DNS zone, in the lumineglyph account.
# The domain itself was bought in the management account, because Route 53 Domains didn't work yet in
# this new account (step 04 D). Its name servers were pointed at this zone by hand (D.4). Step 04 G moves
# the registration into this account and adds it below.
resource "aws_route53_zone" "main" {
  name    = var.domain
  comment = "Site DNS for ${var.domain}, managed by Terraform (infra/main)"

  # Never let Terraform delete this zone. A new zone gets new name servers, and the domain would point at nothing.
  lifecycle {
    prevent_destroy = true
  }
}

output "name_servers" {
  description = "The zone's name servers. The domain registration must list exactly these."
  value       = aws_route53_zone.main.name_servers
}
```
Then:
```sh
cd infra/main
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **1 to add**, the zone, and nothing else.

```sh
aws sts get-caller-identity --query Account --output text   # 421803180949
terraform apply main.tfplan
rm main.tfplan
terraform output name_servers
cd ../..
```
- [ ] `output` prints four name servers like `ns-123.awsdns-45.com`. The zone costs $0.50/month.

**2. Buy the domain in the management account.** Check it's still available:
```sh
aws route53domains check-domain-availability --profile ged-management --region us-east-1 --domain-name lumineglyph.com
```
- [ ] `"Availability": "AVAILABLE"`

Then in the console:
1. Open the SSO portal, choose the **Ged Miner** (management) account, then **AdministratorAccess**.
2. Route 53 → **Registered domains** → **Register domains**. Search for `lumineglyph.com`, select it, then **Proceed to checkout**.
3. Duration **1 year**, **Auto-renew on**.
4. Contacts: fill them in, with yourself as the registrant. Keep **Privacy protection on** for all contacts (the default).
5. Review, accept the terms, and **Submit**. The management account's card is charged $16.

Your management account's `org-monthly-total` budget may email an alert this month because of this charge. It's expected.

**3. Confirm the registrant email, and wait for the registration.** Within minutes, an email from `noreply@registrar.amazon` (or the registry) arrives at the registrant address. **Click the link.** ICANN rules suspend the domain if it isn't verified within 15 days. Registration takes a few minutes to a few hours. Check:
```sh
aws route53domains list-operations --profile ged-management --region us-east-1 \
  --query 'Operations[].[Type,Status,SubmittedDate]' --output table
```
- [ ] A `REGISTER_DOMAIN` row with status `SUCCESSFUL`. If it says `IN_PROGRESS`, wait and run it again.
- [ ] Note the registration date. Part G can start **14 days later**. Put a reminder in your calendar.

**The next two steps have a deadline.** When the registration succeeds, Route 53 also creates a hosted zone in the **management** account, and starts charging for it unless it's deleted within 12 hours. D.4 and D.5 replace it with the Terraform zone from D.1. Do them as soon as the registration succeeds.

**4. Point the domain at the Terraform zone.** From the repo root, with `AWS_PROFILE=lumineglyph` exported (Terraform reads the zone's name servers from the state in S3):
```sh
NS_JSON=$(terraform -chdir=infra/main output -json name_servers | jq -c 'map({Name: .})')
echo "$NS_JSON"     # four {"Name":"ns-…"} entries
aws route53domains update-domain-nameservers --profile ged-management --region us-east-1 \
  --domain-name lumineglyph.com --nameservers "$NS_JSON"
```
It prints an `OperationId`. After a minute or two:
```sh
aws route53domains get-domain-detail --profile ged-management --region us-east-1 \
  --domain-name lumineglyph.com --query 'Nameservers[].Name'
terraform -chdir=infra/main output name_servers
```
- [ ] Both commands list the same four names. The order may differ.

**5. Delete the zone Route 53 created in the management account.** Find it:
```sh
aws route53 list-hosted-zones-by-name --profile ged-management --dns-name lumineglyph.com \
  --query 'HostedZones[?Name==`lumineglyph.com.`].[Id,ResourceRecordSetCount,Config.Comment]' --output text
```
- [ ] One line with a `/hostedzone/Z…` ID and `2` records (only the default NS and SOA). If there's more than one line or more than 2 records, stop and show Claude.

```sh
aws route53 delete-hosted-zone --profile ged-management --id /hostedzone/PASTE_THE_ID
```
Check:
```sh
aws route53 list-hosted-zones --profile ged-management --query 'HostedZones[].Name'
```
- [ ] `[]`: the management account has no hosted zones.

Both commands use `--profile ged-management`, so they can't touch the Terraform zone in the `lumineglyph` account.

**6. Check delegation.** Ask a `.com` server directly what it hands out for the domain:
```sh
dig NS lumineglyph.com @a.gtld-servers.net +norec +noall +authority
dig NS lumineglyph.com +short
```
- [ ] The first lists the four name servers from D.1. The second lists them too, though a new domain can take up to an hour or so to show up everywhere.
- [ ] Tell Claude. Claude also checks auto-renew, the transfer lock and privacy on the registration, from the management account.

**6b. Turn on the transfer lock** (added 2026-11-19). Route 53 registered the domain with only the status `active`, and no transfer lock. The lock (`clientTransferProhibited`) stops anyone from moving the domain to another registrar until it's turned off again. G's Terraform keeps it on after the move.
```sh
aws route53domains enable-domain-transfer-lock --profile ged-management --region us-east-1 \
  --domain-name lumineglyph.com
```
It prints an `OperationId`. After a few minutes:
```sh
aws route53domains get-domain-detail --profile ged-management --region us-east-1 \
  --domain-name lumineglyph.com --query 'StatusList'
```
- [ ] The list includes `clientTransferProhibited`.

**7. Commit:**
```sh
git add infra/main/dns.tf
git commit -m "feat(infra): hosted zone in the lumineglyph account"
```

### E. TLS certificate

**1. Create `infra/main/cert.tf`:**
```hcl
# One certificate for the site, www and the PR preview sites. CloudFront only accepts certificates from us-east-1.
resource "aws_acm_certificate" "site" {
  region                    = "us-east-1"
  domain_name               = var.domain
  subject_alternative_names = ["www.${var.domain}", "*.preview.${var.domain}"]
  validation_method         = "DNS"

  # When the certificate has to be replaced, create the new one before deleting the old one.
  lifecycle {
    create_before_destroy = true
  }
}

# ACM checks we control the domain by looking for these DNS records.
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

# Waits until ACM has seen the records and issued the certificate (usually a few minutes).
resource "aws_acm_certificate_validation" "site" {
  region                  = "us-east-1"
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
```

**2. Plan:**
```sh
cd infra/main
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **5 to add**: the certificate, three validation records (apex, www, `*.preview`) and the validation.
```sh
terraform apply main.tfplan
rm main.tfplan
terraform plan                      # expect: No changes
cd ../..
```
The apply waits at `aws_acm_certificate_validation.site: Still creating...` until ACM issues the certificate, usually 1–5 minutes. If it takes longer than 15 minutes, show Claude.

**3. Commit:**
```sh
git add infra/main/cert.tf
git commit -m "feat(infra): TLS certificate"
```

### F. Push, PR, checks

**1. Push and open the PR:**
```sh
git push -u origin rebuild/04-aws-foundation
gh pr create --fill
gh pr checks --watch
```
The `build` check runs as usual. Nothing in it touches `infra/` yet; step 08 adds Terraform checks to CI.

**2. Tell Claude.** Claude runs the checkpoint checks below and updates PROGRESS. Then merge:
```sh
gh pr merge --merge --delete-branch
git switch main && git pull
```

### G. Move the domain into the `lumineglyph` account (14+ days after D.3)

Do this once 14 days have passed since the registration in D.3. Until then, the domain stays in the management account, which works fine: DNS and the site don't depend on which account holds the registration. Steps 05–07 can go ahead in the meantime.

**0. Check the new account can use Route 53 Domains now:**
```sh
export AWS_PROFILE=lumineglyph
aws route53domains check-domain-availability --region us-east-1 --domain-name example-$(openssl rand -hex 4).com
```
- [ ] `AVAILABLE`. If it still says `DONT_KNOW`, don't start the transfer: accepting it would probably fail too. Tell Claude, and follow up on the support case.

**1. Branch:**
```sh
git switch main && git pull
git switch -c rebuild/04g-domain-transfer
```

**2. Start the transfer from the management account:**
```sh
aws route53domains transfer-domain-to-another-aws-account --profile ged-management --region us-east-1 \
  --domain-name lumineglyph.com --account-id 421803180949
```
It prints an `OperationId` and a `Password`. If it fails with an error mentioning the transfer lock instead, turn the lock off with `aws route53domains disable-domain-transfer-lock --profile ged-management --region us-east-1 --domain-name lumineglyph.com` and run it again. Step 4's Terraform turns the lock back on. AWS's docs don't say whether the lock blocks a move between AWS accounts **(verify)**.

The password works like a key to the domain, so keep it out of the repo, PRs and chats. The `lumineglyph` account must accept within **3 days**; otherwise the request is cancelled, and the domain stays where it is.

**3. Accept it in the `lumineglyph` account:**
```sh
aws route53domains accept-domain-transfer-from-another-aws-account --region us-east-1 \
  --domain-name lumineglyph.com --password 'PASTE_THE_PASSWORD'
```
Then check from both sides. The transfer can take a few minutes:
```sh
aws route53domains list-domains --region us-east-1 --query 'Domains[].DomainName'                           # lumineglyph: ["lumineglyph.com"]
aws route53domains list-domains --profile ged-management --region us-east-1 --query 'Domains[].DomainName'  # management: []
```
- [ ] The domain is listed in `lumineglyph` and not in the management account.

The name servers move with the registration, so DNS doesn't change. Check the domain still points at the Terraform zone:
```sh
dig NS lumineglyph.com @a.gtld-servers.net +norec +noall +authority
```

**4. Bring the registration under Terraform.** Add this to the end of `infra/main/dns.tf`. Also replace the comment at the top of the file, which no longer applies, with `# The site's DNS zone and the domain registration, both in the lumineglyph account.`
```hcl
# The domain registration itself. Terraform "adopts" the existing registration; it doesn't buy
# anything, and destroying this resource leaves the domain registered.
# Contact details are deliberately not here: the repo is public. Privacy protection defaults to on.
resource "aws_route53domains_registered_domain" "main" {
  domain_name   = var.domain
  auto_renew    = true
  transfer_lock = true

  dynamic "name_server" {
    for_each = aws_route53_zone.main.name_servers
    content {
      name = name_server.value
    }
  }
}
```
```sh
cd infra/main
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **1 to add**: the registration being adopted, with no change to the zone.
  - If the plan shows the **name servers** changing, stop. That's usually only their order, but Claude checks before anything touches delegation.

```sh
terraform apply main.tfplan
rm main.tfplan
terraform plan                      # expect: No changes
cd ../..
```

**5. Commit, PR, merge:**
```sh
git add infra/main/dns.tf
git commit -m "feat(infra): manage the domain registration in Terraform"
git push -u origin rebuild/04g-domain-transfer
gh pr create --fill
gh pr checks --watch
```
Tell Claude. Claude checks the registration from the `lumineglyph` account, updates PROGRESS, and then you merge:
```sh
gh pr merge --merge --delete-branch
git switch main && git pull
```

## Checkpoint

Claude runs these, all read-only:
- `terraform plan` in `infra/bootstrap` and in `infra/main`: **No changes** in both.
- State bucket:
  - `aws s3api get-bucket-versioning`: versioning is `Enabled`.
  - `get-public-access-block`: all four settings are `true`.
  - `get-bucket-policy`: the TLS-only deny.
  - `get-bucket-encryption`: AES256.
  - `get-bucket-ownership-controls`: `BucketOwnerEnforced`.
- `aws route53domains get-domain-detail --region us-east-1 --domain-name lumineglyph.com`. Until G, add `--profile ged-management`, because the domain is in the management account. Check:
  - auto-renew is on
  - the status includes `clientTransferProhibited`
  - privacy protection is on for every contact
  - the name servers match `terraform output name_servers`
- The management account has no hosted zones; the only `lumineglyph.com` zone is the Terraform one in `lumineglyph`.
- `dig NS lumineglyph.com +short` returns the four name servers of the Terraform zone. A new domain can take up to a few hours to show up everywhere.
- `aws acm describe-certificate --region us-east-1`: status `ISSUED`, covering all three names.
- `aws budgets describe-budgets`: `lumineglyph-monthly` with its two notifications.
- `git ls-files infra` lists no `.tfstate` or `.tfvars` files.

PROGRESS gets the state bucket name, the hosted zone ID and the registration date.

## Commit

The commits are A.6, B.7, C, D.7 and E.3, merged through the PR in F. G has its own branch and PR, 14+ days later.

Step 04 counts as done after F. G is a follow-up and doesn't block step 05.

## ADR

`docs/adr/003-aws-hosting.md`. Claude drafts it, and you reword it as you did for ADR-001 and 002. It covers:
- S3 + CloudFront + Route 53, rather than Netlify, Vercel or Cloudflare Pages
- why Terraform
- why Tokyo plus `us-east-1`
- the trade-off: more moving parts in exchange for owning the whole stack

## Notes for Claude

- Never run `apply`. Run `plan` freely; it needs Matthew's SSO session (`AWS_PROFILE=lumineglyph`).
- Since section 0, `lumineglyph` is the dedicated member account and `ged-management` is the Organization's management account (`658606186432`). Before running anything, check `aws sts get-caller-identity` shows the member account. Nothing in this step should create resources in the management account. The one exception, since 2026-11-19, is the domain registration (D.2) until G moves it. The hosted zone Route 53 creates with it must be deleted in D.5.
- Before each apply, read the full plan and compare the counts with the step's expectations. Anything unexpected (a change or replacement, an extra resource) stops the step until it's explained.
- If a plan ever wants to replace the hosted zone, stop. Replacing the zone changes the name servers and breaks delegation. `prevent_destroy` should also make such a plan fail.
- D.4 changes name servers with `update-domain-nameservers` in the management account. Before D.5 deletes a zone, check that the registration's name servers already match `terraform output name_servers`, and that the zone being deleted has the management account's ID and only 2 records.
- G: never print or log the transfer password. If `accept-domain-transfer-from-another-aws-account` fails, the request expires after 3 days and the domain stays in the management account. Nothing breaks.
- `use_lockfile` replaces DynamoDB-based locking. Don't suggest a lock table.
- The repo is public. No contact details, account-specific emails or `.tfvars` in commits. Bucket names and zone IDs are fine.
- Verified 2026-11-18 against provider v6.73.0 docs (see "What Claude already checked"). Check again if the provider has moved on by the time Matthew starts.
