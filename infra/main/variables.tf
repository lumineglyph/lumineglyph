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
