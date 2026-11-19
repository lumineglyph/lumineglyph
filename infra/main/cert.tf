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
