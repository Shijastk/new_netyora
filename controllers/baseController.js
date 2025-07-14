const logger = require('../utils/logger');
const SearchBuilder = require('../utils/search');

class BaseController {
  constructor(model) {
    this.model = model;
  }

  // Create new document
  async create(req, res) {
    try {
      const doc = await this.model.create(req.body);
      res.success(doc, 'Created successfully', 201);
    } catch (error) {
      logger.error('Create error:', error);
      res.error('Failed to create', 500, error.message);
    }
  }

  // Get all documents with search and pagination
  async getAll(req, res) {
    try {
      const searchBuilder = new SearchBuilder(req.query);
      const { filters, sort, select, populate, pagination } = searchBuilder.build();

      const [docs, total] = await Promise.all([
        this.model
          .find(filters)
          .sort(sort)
          .select(select)
          .populate(populate)
          .skip(pagination.skip)
          .limit(pagination.limit),
        this.model.countDocuments(filters)
      ]);

      res.paginate(docs, pagination.page, pagination.limit, total);
    } catch (error) {
      logger.error('Get all error:', error);
      res.error('Failed to fetch data', 500, error.message);
    }
  }

  // Get single document by ID
  async getOne(req, res) {
    try {
      const doc = await this.model.findById(req.params.id).populate(req.query.populate);
      
      if (!doc) {
        return res.error('Document not found', 404);
      }

      res.success(doc);
    } catch (error) {
      logger.error('Get one error:', error);
      res.error('Failed to fetch data', 500, error.message);
    }
  }

  // Update document
  async update(req, res) {
    try {
      const doc = await this.model.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      if (!doc) {
        return res.error('Document not found', 404);
      }

      res.success(doc, 'Updated successfully');
    } catch (error) {
      logger.error('Update error:', error);
      res.error('Failed to update', 500, error.message);
    }
  }

  // Delete document
  async delete(req, res) {
    try {
      const doc = await this.model.findByIdAndDelete(req.params.id);

      if (!doc) {
        return res.error('Document not found', 404);
      }

      res.success(null, 'Deleted successfully');
    } catch (error) {
      logger.error('Delete error:', error);
      res.error('Failed to delete', 500, error.message);
    }
  }

  // Soft delete document
  async softDelete(req, res) {
    try {
      const doc = await this.model.findByIdAndUpdate(
        req.params.id,
        { isDeleted: true, deletedAt: new Date() },
        { new: true }
      );

      if (!doc) {
        return res.error('Document not found', 404);
      }

      res.success(null, 'Soft deleted successfully');
    } catch (error) {
      logger.error('Soft delete error:', error);
      res.error('Failed to soft delete', 500, error.message);
    }
  }

  // Restore soft deleted document
  async restore(req, res) {
    try {
      const doc = await this.model.findByIdAndUpdate(
        req.params.id,
        { isDeleted: false, deletedAt: null },
        { new: true }
      );

      if (!doc) {
        return res.error('Document not found', 404);
      }

      res.success(doc, 'Restored successfully');
    } catch (error) {
      logger.error('Restore error:', error);
      res.error('Failed to restore', 500, error.message);
    }
  }
}

module.exports = BaseController; 