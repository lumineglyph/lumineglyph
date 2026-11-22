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
