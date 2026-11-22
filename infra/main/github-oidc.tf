# GitHub Actions signs in to AWS with OpenID Connect (OIDC). A job asks GitHub for a short-lived signed
# token, and AWS STS swaps it for temporary credentials of a role whose trust policy names this repo and
# environment. No AWS keys are stored in GitHub.

# Trust tokens issued by GitHub Actions. No thumbprint: AWS validates GitHub's certificate itself
# and ignores a thumbprint if one is given.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  # The token's `sub` claim for jobs in each GitHub environment, checked in step 06 C (production) and
  # step 07 I (preview). GitHub's immutable format includes the owner and repo IDs, so a deleted and
  # re-created repo with the same name can't produce it. Only `main` may use production (step 06 C.5).
  github_sub_production = "repo:lumineglyph@356493958/lumineglyph@1460696603:environment:production"
  github_sub_preview    = "repo:lumineglyph@356493958/lumineglyph@1460696603:environment:preview"
}

# Who may use the role: only a GitHub token meant for AWS, from this repo's production environment.
data "aws_iam_policy_document" "deploy_production_trust" {
  statement {
    sid     = "GitHubProductionEnvironment"
    effect  = "Allow"
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

    # Exact match. A wildcard here (StringLike "repo:…:*") would let other branches, PRs or
    # environments in. That mistake is the usual way OIDC roles get misused.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.github_sub_production]
    }
  }
}

resource "aws_iam_role" "deploy_production" {
  name                 = "lumineglyph-deploy-production"
  description          = "GitHub Actions deploys of lumineglyph.com (production environment only)"
  assume_role_policy   = data.aws_iam_policy_document.deploy_production_trust.json
  max_session_duration = 3600 # the lowest maximum AWS allows; the job asks for 15 minutes
}

# What the role may do: sync files into the site bucket and clear the site's CloudFront cache.
# No s3:GetObject (sync compares against the bucket listing), and nothing on any other bucket or distribution.
data "aws_iam_policy_document" "deploy_production" {
  statement {
    sid       = "ListSiteBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.site.arn]
  }

  statement {
    sid       = "WriteSiteObjects"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
  }

  statement {
    sid       = "InvalidateSiteCache"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.site.arn]
  }
}

resource "aws_iam_role_policy" "deploy_production" {
  name   = "deploy-site"
  role   = aws_iam_role.deploy_production.id
  policy = data.aws_iam_policy_document.deploy_production.json
}

output "deploy_production_role_arn" {
  value = aws_iam_role.deploy_production.arn
}

# Preview deploys (step 07): any same-repo pull request, through the `preview` environment.
# Same trust pattern as production, but the role can only write to the previews bucket.
data "aws_iam_policy_document" "deploy_preview_trust" {
  statement {
    sid     = "GitHubPreviewEnvironment"
    effect  = "Allow"
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
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.github_sub_preview]
    }
  }
}

resource "aws_iam_role" "deploy_preview" {
  name                 = "lumineglyph-deploy-preview"
  description          = "GitHub Actions deploys and cleanup of PR previews (preview environment only)"
  assume_role_policy   = data.aws_iam_policy_document.deploy_preview_trust.json
  max_session_duration = 3600 # the lowest maximum AWS allows; the jobs ask for 15 minutes
}

# Sync files into the previews bucket and delete them on cleanup. Nothing on the site bucket,
# and no CloudFront permissions: the previews distribution doesn't cache, so there's nothing to clear.
data "aws_iam_policy_document" "deploy_preview" {
  statement {
    sid       = "ListPreviewsBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.previews.arn]
  }

  statement {
    sid       = "WritePreviewObjects"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.previews.arn}/*"]
  }
}

resource "aws_iam_role_policy" "deploy_preview" {
  name   = "deploy-previews"
  role   = aws_iam_role.deploy_preview.id
  policy = data.aws_iam_policy_document.deploy_preview.json
}

output "deploy_preview_role_arn" {
  value = aws_iam_role.deploy_preview.arn
}
