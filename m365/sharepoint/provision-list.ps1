<#
.SYNOPSIS
  Creates the "Callout Job Cards" SharePoint list, its columns and its two views.

.EXAMPLE
  # Needs PowerShell 7 and PnP.PowerShell:  Install-Module PnP.PowerShell -Scope CurrentUser
  ./provision-list.ps1 -SiteUrl https://contoso.sharepoint.com/sites/ITServiceDesk -ClientId <entra-app-id>

  ClientId is the Entra app PnP signs in with. Create one once with:
  Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "PnP" -Tenant contoso.onmicrosoft.com

  Safe to re-run: existing columns and views are left alone.
#>
param(
  [Parameter(Mandatory)] [string] $SiteUrl,
  [Parameter(Mandatory)] [string] $ClientId,
  [string] $ListName = "Callout Job Cards"
)
$ErrorActionPreference = "Stop"

Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId

if (-not (Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue)) {
  New-PnPList -Title $ListName -Template GenericList -OnQuickLaunch | Out-Null
  Write-Host "Created list '$ListName'"
}
# The built-in Title column holds the ticket summary; the app and flows always set it.
Set-PnPField -List $ListName -Identity Title -Values @{ Title = "Summary"; Required = $false } | Out-Null

# Internal name -> field XML. Internal names are what Power Apps and Power Automate use.
$fields = [ordered]@{
  TicketID              = '<Field Type="Number" DisplayName="Ticket ID" Required="TRUE" Indexed="TRUE" EnforceUniqueValues="TRUE" Decimals="0" />'
  Store                 = '<Field Type="Text" DisplayName="Store" />'
  SiteAddress           = '<Field Type="Note" DisplayName="Site address" NumLines="3" RichText="FALSE" />'
  QuoteRef              = '<Field Type="Text" DisplayName="Quote ref" />'
  ScheduledFor          = '<Field Type="DateTime" DisplayName="Scheduled for" Format="DateTime" />'
  Technician            = '<Field Type="Text" DisplayName="Technician" />'
  TechnicianEmail       = '<Field Type="Text" DisplayName="Technician email" />'
  Status                = '<Field Type="Choice" DisplayName="Status" Format="Dropdown"><Default>Scheduled</Default><CHOICES><CHOICE>Scheduled</CHOICE><CHOICE>Travelling to site</CHOICE><CHOICE>On site</CHOICE><CHOICE>Travelling back</CHOICE><CHOICE>Closed</CHOICE></CHOICES></Field>'
  LeftOffice            = '<Field Type="DateTime" DisplayName="Left office" Format="DateTime" />'
  LeftOfficeLocation    = '<Field Type="Text" DisplayName="Left office GPS" />'
  ArrivedOnSite         = '<Field Type="DateTime" DisplayName="Arrived on site" Format="DateTime" />'
  ArrivedOnSiteLocation = '<Field Type="Text" DisplayName="Arrived on site GPS" />'
  LeftSite              = '<Field Type="DateTime" DisplayName="Left site" Format="DateTime" />'
  LeftSiteLocation      = '<Field Type="Text" DisplayName="Left site GPS" />'
  BackInOffice          = '<Field Type="DateTime" DisplayName="Back in office" Format="DateTime" />'
  BackInOfficeLocation  = '<Field Type="Text" DisplayName="Back in office GPS" />'
  TravelOutMins         = '<Field Type="Number" DisplayName="Travel out (min)" Decimals="0" />'
  OnSiteMins            = '<Field Type="Number" DisplayName="On site (min)" Decimals="0" />'
  TravelBackMins        = '<Field Type="Number" DisplayName="Travel back (min)" Decimals="0" />'
  TotalMins             = '<Field Type="Number" DisplayName="Total (min)" Decimals="0" />'
  JobMonth              = '<Field Type="Text" DisplayName="Job month" Indexed="TRUE" />'
  LastStep              = '<Field Type="Text" DisplayName="Last step" />'
  HaloSyncedStep        = '<Field Type="Text" DisplayName="Halo synced step" />'
}

$existing = (Get-PnPField -List $ListName).InternalName
foreach ($name in $fields.Keys) {
  if ($existing -contains $name) { continue }
  $xml = $fields[$name] -replace '^<Field ', "<Field ID=`"{$([guid]::NewGuid())}`" Name=`"$name`" StaticName=`"$name`" "
  Add-PnPFieldFromXml -List $ListName -FieldXml $xml | Out-Null
  Write-Host "Added column $name"
}

# GPS columns render as a "Map" link.
$mapFormat = Get-Content (Join-Path $PSScriptRoot "location-column-format.json") -Raw
foreach ($name in "LeftOfficeLocation", "ArrivedOnSiteLocation", "LeftSiteLocation", "BackInOfficeLocation") {
  Set-PnPField -List $ListName -Identity $name -Values @{ CustomFormatter = $mapFormat } | Out-Null
}

$viewFields = "TicketID", "Title", "Store", "Technician", "Status", "LeftOffice", "ArrivedOnSite", "LeftSite", "BackInOffice", "TravelOutMins", "OnSiteMins", "TravelBackMins", "TotalMins", "ArrivedOnSiteLocation"
$views = (Get-PnPView -List $ListName).Title

if ($views -notcontains "Open job cards") {
  Add-PnPView -List $ListName -Title "Open job cards" -Fields $viewFields -SetAsDefault -Query @"
<Where><Neq><FieldRef Name='Status'/><Value Type='Choice'>Closed</Value></Neq></Where>
<OrderBy><FieldRef Name='Modified' Ascending='FALSE'/></OrderBy>
"@ | Out-Null
}

if ($views -notcontains "Monthly report") {
  Add-PnPView -List $ListName -Title "Monthly report" -Fields $viewFields -RowLimit 500 -Query @"
<GroupBy Collapse='TRUE' GroupLimit='100'><FieldRef Name='JobMonth' Ascending='FALSE'/></GroupBy>
<Where><Eq><FieldRef Name='Status'/><Value Type='Choice'>Closed</Value></Eq></Where>
<OrderBy><FieldRef Name='BackInOffice' Ascending='FALSE'/></OrderBy>
"@ | Out-Null
  # Per-month totals: number of job cards, average and total minutes.
  Set-PnPView -List $ListName -Identity "Monthly report" -Values @{
    Aggregations       = "<FieldRef Name='TicketID' Type='COUNT'/><FieldRef Name='TravelOutMins' Type='AVG'/><FieldRef Name='OnSiteMins' Type='AVG'/><FieldRef Name='TravelBackMins' Type='AVG'/><FieldRef Name='TotalMins' Type='SUM'/>"
    AggregationsStatus = "On"
  } | Out-Null
}

Write-Host "Done. Open the list from the site's left-hand menu: $ListName"
