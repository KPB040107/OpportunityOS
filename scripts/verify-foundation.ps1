param(
    [Parameter(Mandatory=$true)][uri]$BaseUrl,
    [Parameter(Mandatory=$true)][guid]$UserId
)
$ErrorActionPreference = 'Stop'
if ($BaseUrl.Scheme -ne 'https' -and $BaseUrl.Host -ne 'localhost') {
    throw 'Use HTTPS for public webhook verification.'
}
$secret = Read-Host 'Foundation webhook secret' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $body = @{ user_id = $UserId.ToString() } | ConvertTo-Json
    $url = $BaseUrl.AbsoluteUri.TrimEnd('/') + '/webhook/opportunityos-foundation'
    $result = Invoke-RestMethod -Uri $url -Method Post -Headers @{'X-Foundation-Key'=$token} -ContentType 'application/json' -Body $body
    if (-not $result.event_id) { throw 'Webhook returned no persisted event ID.' }
    Write-Host "Database write verified. Event ID: $($result.event_id)"
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $token = $null
}
