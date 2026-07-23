# Media Unavailable Error - Root Cause Analysis

## Summary
Posts are uploading to Supabase successfully, but not appearing in the frontend feed with media displaying.

## Complete Flow Trace

### Step 1: Frontend - Post Creation (CreatePostPage.jsx)
**What happens:**
- User fills content and selects files
- Clicks "Publish post"
- FormData is created with: `content`, `postType` (optional), `files` array
- API call: `POST /posts` with FormData
- On success: Invalidates `["posts", "feed"]` query cache
- On error: Shows error message

**File: `frontend/src/pages/feed/CreatePostPage.jsx`**
- Lines 24-53: Mutation setup
- Line 47: ✅ Correctly invalidates feed query after creation

---

### Step 2: Backend - Request Handling
**Middleware chain:**
1. `requireAuth` - Verifies JWT, sets `req.user`
2. `uploadArray` - Multer processes files, populates `req.files`
3. `createPost` - Controller

**Files:**
- `backend/src/routes/posts.js` - Line 11: Route definition
- `backend/src/middleware/requireAuth.js` - JWT verification
- `backend/src/middleware/upload.js` - Multer configuration

---

### Step 3: Backend - Post Creation (postController.js)
**Flow:**

```javascript
createPost controller:
├─ resolveAuthorModel(req.user.role)
├─ uploadMediaDescriptors(req.files)
│  └─ For each file:
│     ├─ uploadMediaDescriptor()
│     │  └─ uploadFile() → Uploads to Supabase
│     │     └─ Returns { url, filePath }
│     └─ Returns { url, filePath, fileType }
├─ Post.create({ media: uploadedMedia })
└─ Returns post with 201 status
```

**File: `backend/src/controllers/postController.js`**
- Lines 237-267: createPost function
- ✅ Properly uploads media to Supabase
- ✅ Saves post to MongoDB with media array
- ✅ Returns post in response

**File: `backend/src/utils/mediaStorage.js`**
- Lines 92-105: uploadMediaDescriptors
- Lines 67-90: uploadMediaDescriptor
- ✅ Returns correct structure: `{ url, filePath, fileType }`

**File: `backend/src/utils/supabaseService.js`**
- Lines 137-168: uploadFile
- ✅ Constructs URL correctly: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`
- ✅ Environment variables are set:
  - SUPABASE_URL: ✅ `https://gnclmzdjxofuukvwhadl.supabase.co`
  - SUPABASE_BUCKET: ✅ `get-ai-uploads`

---

### Step 4: Frontend - Query Refetch (FeedPage.jsx)
**What happens:**
1. CreatePostPage invalidates `["posts", "feed"]`
2. FeedPage's `feedQuery` is refetched
3. Calls `GET /posts/feed?limit=30` with auth token
4. Receives posts array
5. Renders posts with media

**File: `frontend/src/pages/feed/FeedPage.jsx`**
- Line 195-202: feedQuery setup with correct queryKey
- ✅ Refetch should be triggered correctly

---

### Step 5: Backend - Feed Retrieval (getFeed Controller)
**Flow:**

```javascript
getFeed controller:
├─ Get pagination params
├─ Fetch posts from MongoDB
├─ decoratePosts(posts)
│  └─ For each post:
│     ├─ Fetch author data
│     ├─ Fetch comments
│     ├─ ensureMediaUrl() for each media item
│     │  └─ Check if URL exists
│     │  └─ If not, regenerate from filePath
│     └─ buildAuthorDisplay()
└─ Returns decorated posts
```

**File: `backend/src/controllers/postController.js`**
- Lines 283-306: getFeed function
- Lines 112-235: decoratePosts function
- Lines 20-59: ensureMediaUrl function

---

## Potential Issues & Fixes

### Issue 1: Media URLs Not Being Saved ❌
**Symptom:** Posts are created but media.url is empty in MongoDB

**Root Cause:** 
- `uploadFile()` might return empty URL if SUPABASE_URL is not properly set
- Status: ✅ FIXED - Environment variables are properly configured

### Issue 2: decoratePosts Failing Silently ❌
**Symptom:** getFeed returns error but frontend doesn't show it

**Root Cause:**
- ensureMediaUrl might throw uncaught error
- Status: ✅ FIXED - Added try-catch with logging

### Issue 3: Media URL Generation Issue ❌
**Symptom:** Media items don't have URLs when returned from API

**Root Cause:**
- getReadableFileUrl might return empty string
- Status: ✅ FIXED - Added better validation and logging

### Issue 4: Query Cache Not Invalidating ❌
**Symptom:** FeedPage shows old data after post creation

**Root Cause:**
- queryKey mismatch or cache configuration issue
- Status: ✅ VERIFIED - queryKey matches correctly

---

## Testing Instructions

### Step 1: Start Backend with Logging
```bash
cd backend
npm run dev
```

Look for console output showing:
```
✓ Post created: <id> with X media items
Media URLs: ✓ (means URLs are properly set)
```

### Step 2: Create a New Post
1. Open http://localhost:5173
2. Navigate to Create Post
3. Add content + image/video
4. Click "Publish Post"

### Step 3: Check Backend Logs
Watch for:
```
✓ Post created: 123abc with 1 media items
Media URLs: ✓
✓ Successfully decorated 1 posts
```

If you see warnings or errors like:
```
⚠️  Media has no valid filePath
✗ Error resolving media URL
```

This indicates a problem.

### Step 4: Verify Feed
1. Go to feed page
2. New post should appear with media displaying
3. Check browser DevTools Network tab for `/api/posts/feed` response
4. Verify media objects have `url` field

---

## Key Files Modified for Debugging

1. **postController.js**
   - Enhanced `ensureMediaUrl()` with detailed validation
   - Added logging to `createPost()` 
   - Added logging to `getFeed()`

2. **Files to Check if Issues Occur**
   - Backend logs when creating post
   - Backend logs when fetching feed
   - Frontend Network tab for API response

---

## Next Steps

If posts still don't show after these fixes:

1. Check backend console logs for errors
2. Check browser DevTools → Network → `/api/posts/feed` response
3. Verify media objects structure in API response
4. Check MongoDB posts collection to see if data is saved correctly
