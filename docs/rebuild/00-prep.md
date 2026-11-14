# 00 — Prep

## Goal

By the end of this step:
- the repo is where it will live long term
- you have a branch workflow
- your AWS account is secured, and you log in with short-lived SSO credentials
- you've decided on a registrar

## Why it matters

- **Repo name.** Everything later, especially GitHub-to-AWS trust (OIDC), is tied to the repo's name and ID. Moving the repo after step 06 breaks deploys, so settle it now.
- **No access keys.** Short-lived SSO credentials instead of access keys are the security habit the rest of the tutorial builds on.

## Steps

### 1. Tools

Check that you have:
- `node --version`: 24.x
- `terraform version`: 1.17 or later
- `aws --version`: CLI v2
- `gh auth status`

All four are already installed on this machine as of 2026-11-13. Optional extras:
- the Astro and HashiCorp Terraform extensions for VS Code
- `dig` (from `dnsutils`) for checking DNS in steps 04 and 08

### 2. Decide where the repo lives

Right now the repo is `moena-miner/lumineglyph`. I recommend a free GitHub organization called `lumineglyph`:
- Both of you are owners.
- Both of your profiles can pin the repo.
- OIDC trust and settings belong to the business, not to one person.

Steps:
1. Agree on this with Moena (open question in PROGRESS).
2. Create the org at github.com/organizations/plan (Free plan) and invite Moena as an owner.
3. Moena transfers the repo: Settings → General → Danger Zone → Transfer.
4. Point your remote at the new location. Keep your SSH host alias:
   ```sh
   git remote set-url origin git@github-gedminer:lumineglyph/lumineglyph.git
   git fetch
   ```
5. Record the IDs. You need them in step 06.
   ```sh
   gh api repos/lumineglyph/lumineglyph --jq '{repo_id: .id, owner_id: .owner.id}'
   ```

> **Gotcha: OIDC subject format.** Since July 2026, GitHub uses a new format for the OIDC `sub` claim on any repo created or transferred after 2026-07-15. The new format includes IDs, for example `repo:lumineglyph@<owner-id>/lumineglyph@<repo-id>:...`. A transferred repo gets the new format. Step 06 shows how to check the real value; record it in PROGRESS.

If you skip the org, everything still works with `moena-miner/lumineglyph`. Just put that name wherever the tutorial says `lumineglyph/lumineglyph`.

### 3. Branch workflow

The site isn't hosted yet, so `main` can't break anything in production. Use short-lived feature branches and merge them with PRs, even while working alone. The PR history becomes part of the portfolio, and from step 03 on, CI runs on every PR.

- Commit these tutorial docs to `main` first, so every session can find them.
- Suggested branch names: `rebuild/01-astro-port`, `rebuild/04-aws-foundation`, and so on.
- The old static files stay at the repo root until the Astro version matches them visually (end of step 01). They're removed in that same PR.

### 4. Secure the AWS account

If you have several AWS accounts, a dedicated account for Lumineglyph (under AWS Organizations) keeps any mistakes contained. One personal account also works.

1. **Root user:** turn on MFA, ideally a passkey or hardware key. Make sure the root user has no access keys. Don't use root again after this step.
2. **IAM Identity Center:** enable it in your main region (`ap-northeast-1` is the plan; see the note below).
   - Create a user for yourself.
   - Create a permission set. `AdministratorAccess` is fine for your own day-to-day user.
   - Assign the user and permission set to the account.
3. **CLI login with SSO, no stored keys:**
   ```sh
   aws configure sso            # profile name suggestion: lumineglyph
   aws sso login --profile lumineglyph
   aws sts get-caller-identity --profile lumineglyph
   ```
   To avoid typing `--profile` every time:
   ```sh
   export AWS_PROFILE=lumineglyph
   ```
   Put this in a `.envrc` with direnv, or just in your shell. Don't commit it.
4. There should be **no IAM users with access keys** anywhere in this project. CI gets credentials through OIDC (step 06).

**Region choice.** Most visitors will be in Japan.
- **Buckets** go in `ap-northeast-1` (Tokyo), which keeps cache-miss fetches short.
- **CloudFront** is global, and its price class must include Asia (step 05).
- **ACM certificates and the DNSSEC KMS key** must be in `us-east-1`. AWS provider v6 has a per-resource `region` argument for these (step 04).

### 5. Decide the registrar

Compare `.com` prices. This command is read-only:
```sh
aws route53domains list-prices --tld com --region us-east-1
```
Compare with Namecheap's first-year and renewal prices.

**Recommendation: Route 53.**
- The registration itself is in Terraform: name servers, auto-renew, transfer lock, and the DNSSEC DS record in step 08.
- With Namecheap, you set the name servers and add the DS record in their dashboard by hand. That's fine, but those settings live outside your code.
- ICANN blocks transfers for 60 days after registration, so choose once.

Don't buy the domain yet. You'll buy it in step 04.

## Checkpoint

Ask Claude to check step 00. Claude will run:
- `git remote -v`: points to the final repo location.
- `gh api repos/<owner>/<repo> --jq '.id, .owner.id'`: IDs recorded in PROGRESS.
- `aws sts get-caller-identity --profile <profile>`: shows an assumed SSO role (`AWSReservedSSO_...`), not an IAM user.
- `aws iam list-users --profile <profile>`: no users with access keys. Root MFA can only be confirmed by you, in the console.

PROGRESS gets the registrar decision, the profile name and the region.

## Commit

```
docs: add rebuild tutorial
```
Commit this straight to `main`. It's the only commit that skips the PR process.
