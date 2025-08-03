const express = require("express");
const BlogPost = require("../../models/BlogPost");
const mongoose = require("mongoose");
const { getAsync, setAsync, deletePatternAsync, getUserKey } = require("../../utils/redisClient");

const router = express.Router();

// GET all blogs with caching for SEO performance
router.get('/', async (req, res) => {
  try {
    const cacheKey = 'blog:listing:all';
    
    // 📥 Check cache first (great for SEO since blog lists don't change often)
    const cached = await getAsync(cacheKey);
    if (cached) {
      console.log('📥 Cache hit for blog listing');
      return res.json({ fromCache: true, ...JSON.parse(cached) });
    }

    const blogs = await BlogPost.find().sort({ createdAt: -1 });
    const responseData = { blogs };
    
    // 💾 Cache for 2 hours (blog listings change infrequently)
    await setAsync(cacheKey, JSON.stringify(responseData), 7200);
    console.log('📝 Cached blog listing');
    
    res.json({ fromCache: false, ...responseData });
  } catch (err) {
    console.error("Error fetching blogs:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET single blog by slug with aggressive caching for SEO
router.get('/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const cacheKey = `blog:single:${idOrSlug}`;
    
    // 📥 Check cache first (excellent for SEO - blog posts rarely change)
    const cached = await getAsync(cacheKey);
    if (cached) {
      console.log(`📥 Cache hit for blog: ${idOrSlug}`);
      return res.json({ fromCache: true, ...JSON.parse(cached) });
    }

    let blog;
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      blog = await BlogPost.findById(idOrSlug);
    }

    if (!blog) {
      blog = await BlogPost.findOne({ slug: idOrSlug });
    }

    if (!blog) return res.status(404).json({ error: 'Blog not found' });

    // 💾 Cache individual blog posts for 2 hours (they rarely change)
    await setAsync(cacheKey, JSON.stringify(blog), 7200);
    console.log(`📝 Cached blog post: ${idOrSlug}`);

    res.json({ fromCache: false, ...blog.toObject() });
  } catch (err) {
    console.error("Error fetching blog:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// POST create new blog (full save) with cache invalidation
router.post('/', async (req, res) => {
  const {
    title,
    slug,
    mode,
    wysiwygContent,
    codeContent,
    author = 'Admin',
    published = false,
  } = req.body;

  if (!title || !slug) {
    return res.status(400).json({ error: 'Missing required fields: title and slug' });
  }

  try {
    const exists = await BlogPost.findOne({ slug });
    if (exists) {
      return res.status(409).json({ error: 'A blog with this slug already exists' });
    }

    const blog = new BlogPost({
      title,
      slug,
      mode,
      wysiwygContent,
      codeContent,
      author,
      published,
    });

    await blog.save();
    
    // 🗑️ Invalidate blog listing cache when new blog is created
    await deletePatternAsync('blog:listing:*');
    console.log('🗑️ Invalidated blog listing cache after creation');
    
    res.json({ success: true, created: true, blog });
  } catch (err) {
    console.error("Error creating blog:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST autosave for blog drafts (no slug conflict checks)
router.post('/autosave', async (req, res) => {
  const {
    title,
    mode,
    wysiwygContent,
    codeContent,
    author = 'Admin',
    published = false,
  } = req.body;

  if (!title) return res.status(400).json({ error: 'Title is required' });

  const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');

  try {
    let blog = await BlogPost.findOne({ slug });

    if (blog) {
      blog.mode = mode || blog.mode;
      blog.wysiwygContent = wysiwygContent;
      blog.codeContent = codeContent;
      blog.updatedAt = new Date();
      await blog.save();
      return res.json({ saved: true, updated: true });
    }

    const newBlog = new BlogPost({
      title,
      slug,
      mode,
      wysiwygContent,
      codeContent,
      author,
      published,
    });

    await newBlog.save();
    return res.json({ saved: true, created: true });

  } catch (err) {
    console.error('Autosave error:', err);
    return res.status(500).json({ error: 'Autosave failed' });
  }
});

// PUT update blog by ID with cache invalidation
router.put('/:id', async (req, res) => {
  try {
    const original = await BlogPost.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Blog not found' });
    
    const updated = await BlogPost.findByIdAndUpdate(req.params.id, {
      ...req.body,
      updatedAt: new Date()
    }, { new: true });

    // 🗑️ Invalidate specific blog and listing caches
    await deletePatternAsync(`blog:single:${original._id}`);
    await deletePatternAsync(`blog:single:${original.slug}`);
    await deletePatternAsync('blog:listing:*');
    console.log(`🗑️ Invalidated cache for updated blog: ${original.slug}`);

    res.json(updated);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// DELETE blog with cache invalidation
router.delete('/:id', async (req, res) => {
  try {
    const blog = await BlogPost.findById(req.params.id);
    if (blog) {
      // 🗑️ Invalidate specific blog and listing caches before deletion
      await deletePatternAsync(`blog:single:${blog._id}`);
      await deletePatternAsync(`blog:single:${blog.slug}`);
      await deletePatternAsync('blog:listing:*');
      console.log(`🗑️ Invalidated cache for deleted blog: ${blog.slug}`);
    }
    
    await BlogPost.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

module.exports = router;
