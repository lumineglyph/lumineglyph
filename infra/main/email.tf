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
