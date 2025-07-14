const logger = require('./logger');

class SearchBuilder {
  constructor(query) {
    this.query = query;
    this.filters = {};
    this.sort = {};
    this.select = {};
    this.populate = [];
    this.page = 1;
    this.limit = 10;
  }

  // Add text search
  textSearch(fields) {
    if (this.query.search) {
      const searchRegex = new RegExp(this.query.search, 'i');
      this.filters.$or = fields.map(field => ({
        [field]: searchRegex
      }));
    }
    return this;
  }

  // Add exact match filter
  exactMatch(field, queryField) {
    if (this.query[queryField]) {
      this.filters[field] = this.query[queryField];
    }
    return this;
  }

  // Add range filter
  range(field, minField, maxField) {
    if (this.query[minField] || this.query[maxField]) {
      this.filters[field] = {};
      if (this.query[minField]) {
        this.filters[field].$gte = this.query[minField];
      }
      if (this.query[maxField]) {
        this.filters[field].$lte = this.query[maxField];
      }
    }
    return this;
  }

  // Add array filter
  arrayFilter(field, queryField) {
    if (this.query[queryField]) {
      this.filters[field] = {
        $in: Array.isArray(this.query[queryField])
          ? this.query[queryField]
          : [this.query[queryField]]
      };
    }
    return this;
  }

  // Add sorting
  sortBy(field, defaultSort = -1) {
    const sortField = this.query.sortBy || field;
    const sortOrder = this.query.sortOrder === 'asc' ? 1 : -1;
    this.sort[sortField] = sortOrder;
    return this;
  }

  // Add field selection
  select(fields) {
    this.select = fields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {});
    return this;
  }

  // Add population
  populate(field, select = '') {
    this.populate.push({ path: field, select });
    return this;
  }

  // Add pagination
  paginate() {
    this.page = parseInt(this.query.page) || 1;
    this.limit = parseInt(this.query.limit) || 10;
    return this;
  }

  // Build the search query
  build() {
    try {
      return {
        filters: this.filters,
        sort: this.sort,
        select: this.select,
        populate: this.populate,
        pagination: {
          page: this.page,
          limit: this.limit,
          skip: (this.page - 1) * this.limit
        }
      };
    } catch (error) {
      logger.error('Search builder error:', error);
      throw error;
    }
  }
}

module.exports = SearchBuilder; 