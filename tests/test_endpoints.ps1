# Test FractionaX API Endpoints

Write-Host "🔍 Testing FractionaX API Endpoints..." -ForegroundColor Green

# Test 1: POST /api/ai
Write-Host "`n1. Testing POST /api/ai (Main AI Search)" -ForegroundColor Yellow
try {
    $body = @{
        query = "I want a 3 bedroom house in Houston under 200000"
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/ai" -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    $jsonResponse = $response.Content | ConvertFrom-Json
    Write-Host "Found $($jsonResponse.listings.Count) listings" -ForegroundColor Cyan
    Write-Host "Filters: $($jsonResponse.filters | ConvertTo-Json -Compress)" -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: POST /api/ai/pipeline
Write-Host "`n2. Testing POST /api/ai/pipeline (Cached AI Search)" -ForegroundColor Yellow
try {
    $body = @{
        prompt = "Find me properties in downtown Houston"
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/ai/pipeline" -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    $jsonResponse = $response.Content | ConvertFrom-Json
    Write-Host "Session ID: $($jsonResponse.session_id)" -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: GET /api/ai/fast-comp
Write-Host "`n3. Testing GET /api/ai/fast-comp (Fast Property Details)" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/ai/fast-comp?address=123%20Main%20St`&zip=77002"
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    $jsonResponse = $response.Content | ConvertFrom-Json
    Write-Host "Success: $($jsonResponse.success)" -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: POST /api/ai/full-comp
Write-Host "`n4. Testing POST /api/ai/full-comp (Full Property Report)" -ForegroundColor Yellow
try {
    $body = @{
        address1 = "123 Main St"
        city = "Houston"
        state = "TX"
        postalcode = "77002"
        lat = 29.7604
        lng = -95.3698
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/ai/full-comp" -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    $jsonResponse = $response.Content | ConvertFrom-Json
    Write-Host "Success: $($jsonResponse.success)" -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: POST /api/ai/reset
Write-Host "`n5. Testing POST /api/ai/reset (Clear Chat Memory)" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/ai/reset" -Method POST -Headers @{"Content-Type"="application/json"} -Body "{}"
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    $jsonResponse = $response.Content | ConvertFrom-Json
    Write-Host "Message: $($jsonResponse.message)" -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: GET /api/suggested
Write-Host "`n6. Testing GET /api/suggested (Curated Deals)" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/suggested"
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    $jsonResponse = $response.Content | ConvertFrom-Json
    Write-Host "Success: $($jsonResponse.success)" -ForegroundColor Cyan
    Write-Host "Deals Count: $($jsonResponse.deals.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n✅ Testing completed!" -ForegroundColor Green
