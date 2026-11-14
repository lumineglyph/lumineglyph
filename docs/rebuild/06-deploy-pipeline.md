# 06 — Deploy pipeline: OIDC and automatic production deploys

## Goal

Merging to `main` deploys the artifact CI built to production automatically. AWS access comes from short-lived OIDC credentials tied to a GitHub `production` environment. No AWS keys are stored anywhere.

## Why it matters

- OIDC trust between GitHub and AWS, least-privilege roles and environment-scoped deploys are current best practice. Many teams still use stored keys, so doing this properly stands out.
- Rollback is just re-running an older deploy job.

## Steps

### A. OIDC provider and role (`github-oidc.tf`)

```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "deploy_prod_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"            # exact match, never StringLike with wildcards
      variable = "token.actions.githubusercontent.com:sub"
      values   = [var.github_oidc_sub_production]
    }
  }
}
```

**The `sub` value.** For a job that uses an environment, the classic format is `repo:lumineglyph/lumineglyph:environment:production`.

Repos created or transferred after 2026-07-15 use GitHub's newer format, which includes owner and repo IDs. It probably looks like `repo:lumineglyph@<owner-id>/lumineglyph@<repo-id>:environment:production`, but GitHub's docs only show branch examples. **Don't guess. Check it.** Add this temporary step to a job that has `id-token: write` and `environment: production`:

```yaml
- name: Show OIDC sub (temporary)
  uses: actions/github-script@<sha> # pin latest
  with:
    script: |
      const token = await core.getIDToken("sts.amazonaws.com");
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      core.info(`sub=${claims.sub}`);   // print the claim, never the token
```

Put the exact value in `terraform.tfvars` (or as a variable default) and in PROGRESS. Then remove the step.

**Role permissions** for `aws_iam_role.deploy_prod` (an inline policy is fine):

| Action | Resource |
|--------|----------|
| `s3:ListBucket` | the site bucket ARN |
| `s3:PutObject`, `s3:DeleteObject` | `<site bucket ARN>/*` |
| `cloudfront:CreateInvalidation` | the site distribution ARN |

Also set `max_session_duration = 3600`. A deploy takes about a minute.

### B. GitHub environment

Settings → Environments → New environment `production`:
- **Deployment branches:** Selected branches → `main` only. Even with the trust policy, a workflow on another branch can't use this environment.
- **Required reviewers:** none. Moena's merged edits should go live without waiting for you. Branch protection plus CI is the gate.
- **Environment variables** (not secrets; none of these are sensitive):
  - `AWS_REGION=ap-northeast-1`
  - `AWS_DEPLOY_ROLE_ARN`
  - `SITE_BUCKET`
  - `SITE_DISTRIBUTION_ID`

### C. Deploy job

Add this to `pipeline.yml`:

```yaml
  deploy-production:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment:
      name: production
      url: https://lumineglyph.com
    permissions:
      contents: read
      id-token: write          # only this job can request an OIDC token
    concurrency:
      group: deploy-production
      cancel-in-progress: false  # never cut a deploy off halfway
    steps:
      - uses: actions/download-artifact@<sha> # v8.0.2
        with:
          name: site-dist
          path: dist
      - uses: aws-actions/configure-aws-credentials@<sha> # v6.3.0
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
      - name: Upload hashed assets
        run: >
          aws s3 sync dist/_astro "s3://${{ vars.SITE_BUCKET }}/_astro"
          --cache-control "public, max-age=31536000, immutable"
      - name: Upload pages
        run: >
          aws s3 sync dist "s3://${{ vars.SITE_BUCKET }}" --delete --exclude "_astro/*"
          --cache-control "public, max-age=0, s-maxage=31536000, must-revalidate"
      - name: Invalidate CDN
        run: >
          aws cloudfront create-invalidation
          --distribution-id "${{ vars.SITE_DISTRIBUTION_ID }}" --paths "/*"
```

Notes:
- The deploy job has no checkout step, because it doesn't need the source.
- It deploys exactly the artifact the `build` job tested.

### D. Rollback

There are two ways:
- **Revert the change:** `git revert` the bad change and merge it. The normal path.
- **Faster:** open the last good run under Actions and re-run its `deploy-production` job. It redeploys that run's artifact. Artifacts are kept for 90 days by default.

Write both in the repo README in step 09.

## Checkpoint

- Merge a harmless copy change through a PR. The `deploy-production` job runs, the environment shows the deployment, and the change is live within a minute or two.
- **Negative test.** Temporarily add a job on a non-`main` branch that uses `environment: production`. GitHub refuses it because of the deployment-branch rule. Delete the job.
- Claude reviews:
  - the IAM policy is no broader than the table above
  - the trust policy uses `StringEquals` on both `aud` and `sub`
  - `id-token: write` appears only on deploy jobs
  - no `aws_iam_access_key` exists anywhere
- Claude checks CloudTrail: `aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity --max-results 5` shows the role being assumed by GitHub.

PROGRESS gets the role ARN and the `sub` format.

## Commit

`feat(infra): GitHub OIDC provider and production deploy role`, then `ci: deploy main to production`.

## Optional stretch

Manage the GitHub side (the environment, its variables, the ruleset) with the `integrations/github` Terraform provider. Then the repo settings are code too. If you do it, note it in PROGRESS and the README.
