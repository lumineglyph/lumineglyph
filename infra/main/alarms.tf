# Alarms (step 08 D). Route 53's DNSSEC metrics and CloudFront's metrics are only published in
# us-east-1, so the alarms and the topic they notify live there too.

# Alarm emails go to var.alert_email (the same address as the budget alerts). AWS sends a confirmation
# email once; nothing arrives until someone clicks its link.
resource "aws_sns_topic" "alerts" {
  #checkov:skip=CKV_AWS_26:CloudWatch can't publish to a topic encrypted with the AWS-managed key; a customer key costs $1/month, and alarm messages hold no secrets.
  region = "us-east-1"
  name   = "lumineglyph-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  region    = "us-east-1"
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# AWS recommends alarming on these two: either one means the zone may soon stop resolving.
resource "aws_cloudwatch_metric_alarm" "dnssec_internal_failure" {
  region              = "us-east-1"
  alarm_name          = "lumineglyph-dnssec-internal-failure"
  alarm_description   = "Route 53 couldn't sign ${var.domain}. Check the zone's DNSSEC signing status and the KMS key (step 08 C)."
  namespace           = "AWS/Route53"
  metric_name         = "DNSSECInternalFailure"
  dimensions          = { HostedZoneId = aws_route53_zone.main.zone_id }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "dnssec_ksk_needs_action" {
  region              = "us-east-1"
  alarm_name          = "lumineglyph-dnssec-ksk-needs-action"
  alarm_description   = "A DNSSEC key-signing key for ${var.domain} needs action, usually because the KMS key was disabled or its policy changed (step 08 C)."
  namespace           = "AWS/Route53"
  metric_name         = "DNSSECKeySigningKeysNeedingAction"
  dimensions          = { HostedZoneId = aws_route53_zone.main.zone_id }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# The live site returning server errors (5xx) for more than 5% of requests, 15 minutes in a row.
# The site only serves files from S3, so this would mean an S3 or CloudFront problem, not a bad deploy.
resource "aws_cloudwatch_metric_alarm" "site_5xx" {
  region              = "us-east-1"
  alarm_name          = "lumineglyph-site-5xx"
  alarm_description   = "lumineglyph.com is returning 5xx errors for more than 5% of requests."
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  dimensions          = { DistributionId = aws_cloudfront_distribution.site.id, Region = "Global" }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
