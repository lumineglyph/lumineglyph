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
