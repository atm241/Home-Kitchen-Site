# Smith's Grocery Price Integration

This document outlines the plan for integrating Smith's (Kroger) grocery prices into the Home Kitchen app.

## Current Status

The app is **fully functional** with manual price entry. The grocery price system is built and ready - it just needs real price data from Smith's.

## Database Structure (Already Built)

The `grocery_prices` table stores:
- ingredient_id
- store_name (e.g., "Smiths")
- price
- quantity
- unit
- last_updated

## Integration Options

### Option 1: Kroger API (Recommended)

Smith's is owned by Kroger and uses the Kroger API.

**Pros:**
- Official, legal way to get prices
- Structured data
- Includes product info, prices, and availability

**Cons:**
- Requires API approval (can take time)
- Need to register as a developer
- May have usage limits

**Steps:**
1. Register at https://developer.kroger.com/
2. Create an app and get API credentials
3. Use the Products API to search for ingredients
4. Store prices in the database
5. Set up a cron job to update prices daily/weekly

**API Endpoints:**
```
GET /products/search - Search for products
GET /products/{id} - Get product details including price
GET /locations/{id}/products - Get products at specific store
```

### Option 2: Web Scraping

Scrape prices directly from smithsfoodanddrug.com

**Pros:**
- No API approval needed
- Can start immediately

**Cons:**
- Against ToS (Terms of Service)
- Fragile - breaks when website changes
- May get IP blocked
- Ethical/legal concerns

**Not Recommended** due to legal and reliability issues.

### Option 3: Manual Price Entry (Current)

Users manually enter prices as they shop or from receipts.

**Pros:**
- Always accurate for your specific store
- No API limits
- Works immediately

**Cons:**
- Time-consuming
- Requires user effort

## Recommended Implementation Plan

### Phase 1: Manual Entry (Current - ✅ Complete)
- Users can add/update prices through the UI
- Prices stored in database
- Used for cost estimates

### Phase 2: Kroger API Integration
1. **Register for API access**
   - Apply at developer.kroger.com
   - Wait for approval (1-2 weeks typically)

2. **Create price update service**
   ```typescript
   // server/src/services/krogerApi.ts
   - searchProduct(ingredientName)
   - getProductPrice(productId, locationId)
   - updatePricesForStore(storeId)
   ```

3. **Add UI for store selection**
   - Let users select their Smith's location
   - Store location ID in settings

4. **Schedule price updates**
   - Daily/weekly cron job
   - Update prices for all ingredients
   - Log updates for debugging

### Phase 3: Price History & Tracking
- Track price changes over time
- Show price trends
- Alert when prices spike
- Find best time to buy

## Implementation Code Skeleton

### Kroger API Service

```typescript
// server/src/services/krogerApi.ts
import axios from 'axios';

export class KrogerAPI {
  private clientId: string;
  private clientSecret: string;
  private accessToken?: string;

  async authenticate() {
    // OAuth2 authentication
  }

  async searchProduct(query: string, locationId: string) {
    // Search for products
  }

  async getProductDetails(productId: string) {
    // Get price and details
  }

  async updateIngredientPrice(ingredientId: number, storeName: string) {
    // Update price in database
  }
}
```

### Price Update Route

```typescript
// server/src/routes/grocery.ts
router.post('/prices/update-from-kroger', async (req, res) => {
  const { locationId } = req.body;

  // Get all ingredients
  // Search Kroger API for each
  // Update prices in database
  // Return updated count
});
```

## Smith's Store Locator

To find your store's location ID:
1. Go to smithsfoodanddrug.com
2. Use store locator
3. Heber City, UT store info:
   - Address: 750 S Main St, Heber City, UT 84032
   - Store ID: Will be in API response

## Next Steps

1. **For immediate use**: Continue with manual price entry
2. **For API integration**:
   - Apply for Kroger Developer account
   - Wait for approval
   - Implement Phase 2 above
3. **For testing**:
   - Add sample prices manually via grocery prices endpoint
   - Test budget and cost estimation features

## Adding Manual Prices (For Now)

You can add prices using the API:

```bash
curl -X POST http://localhost:5000/api/grocery/prices \
  -H "Content-Type: application/json" \
  -d '{
    "ingredient_id": 1,
    "store_name": "Smiths",
    "price": 3.99,
    "quantity": 1,
    "unit": "lb"
  }'
```

Or through a future admin UI (to be built).

## Cost Estimation Without Real Prices

The app will still work! It just estimates costs as $0 until you:
1. Manually enter prices, OR
2. Integrate with Kroger API

The rest of the app (recipes, calendar, pantry, meal scheduling) all work perfectly without prices.

## Resources

- Kroger Developer Portal: https://developer.kroger.com/
- Kroger API Docs: https://developer.kroger.com/reference/
- Smith's Website: https://www.smithsfoodanddrug.com/
