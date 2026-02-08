# Helper script to create admin user via API

param(
    [Parameter(Mandatory=$true)]
    [string]$Email,
    
    [Parameter(Mandatory=$true)]
    [string]$Password,
    
    [string]$ApiUrl = "http://localhost:3000"
)

Write-Host "Creating admin user: $Email" -ForegroundColor Yellow
Write-Host "API URL: $ApiUrl" -ForegroundColor Yellow
Write-Host ""

$body = @{
    email = $Email
    password = $Password
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/api/auth/register" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body
    
    Write-Host "✓ Admin user created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Login credentials:" -ForegroundColor Yellow
    Write-Host "  Email: $Email"
    Write-Host "  Password: $Password"
    Write-Host ""
    Write-Host "You can now login at: $ApiUrl/admin.html" -ForegroundColor Cyan
} catch {
    Write-Host "✗ Failed to create admin user" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
