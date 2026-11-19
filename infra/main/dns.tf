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
