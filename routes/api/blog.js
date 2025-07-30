const express = require("express");
const BlogPost = require("../../models/BlogPost");
const mongoose = require("mongoose");

const router = express.Router();

// GET all blogs
router.get('/', async (req, res) => {
  try {
    const blogs = await BlogPost.find().sort({ createdAt: -1 });
    res.json({ blogs });
  } catch (err) {
    console.error("Error fetching blogs:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET single blog by slug
router.get('/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;

    let blog;
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      blog = await BlogPost.findById(idOrSlug);
    }

    if (!blog) {
      blog = await BlogPost.findOne({ slug: idOrSlug });
    }

    if (!blog) return res.status(404).json({ error: 'Blog not found' });

    res.json(blog);
  } catch (err) {
    console.error("Error fetching blog:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// POST create new blog (full save)
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

// PUT update blog by ID
router.put('/:id', async (req, res) => {
  try {
    const updated = await BlogPost.findByIdAndUpdate(req.params.id, {
      ...req.body,
      updatedAt: new Date()
    }, { new: true });

    if (!updated) return res.status(404).json({ error: 'Blog not found' });

    res.json(updated);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// DELETE blog
router.delete('/:id', async (req, res) => {
  try {
    await BlogPost.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

module.exports = router;
