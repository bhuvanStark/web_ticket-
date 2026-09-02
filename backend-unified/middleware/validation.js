// Login validation - used by both admin and technician
export const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email) errors.push('email is required');
  if (!password) errors.push('password is required');

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('email must be valid');
  }

  if (password && password.length < 6) {
    errors.push('password must be at least 6 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'Login validation failed',
      details: errors
    });
  }

  next();
};

// Aliases for compatibility with both backends
export const validateAdminLogin = validateLogin;
export const validateTechnicianLogin = validateLogin;

// Admin registration validation
export const validateAdminRegistration = (req, res, next) => {
  const { email, password, full_name, department } = req.body;
  const errors = [];

  if (!email) errors.push('email is required');
  if (!password) errors.push('password is required');
  if (!full_name) errors.push('full_name is required');
  if (!department) errors.push('department is required');

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('email must be valid');
  }

  if (password && password.length < 8) {
    errors.push('password must be at least 8 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'Registration validation failed',
      details: errors
    });
  }

  next();
};

// Technician registration validation
export const validateTechnicianRegistration = (req, res, next) => {
  const { email, password, full_name, phone, specialization } = req.body;
  const errors = [];

  if (!email) errors.push('email is required');
  if (!password) errors.push('password is required');
  if (!full_name) errors.push('full_name is required');
  if (!phone) errors.push('phone is required');
  if (!specialization) errors.push('specialization is required');

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('email must be valid');
  }

  if (password && password.length < 8) {
    errors.push('password must be at least 8 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'Registration validation failed',
      details: errors
    });
  }

  next();
};

// UUID validation
export const validateUUID = (req, res, next) => {
  const { id } = req.params;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(id)) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'Invalid UUID format'
    });
  }

  next();
};

// Pagination validation
export const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;

  if (page) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'page must be a positive integer'
      });
    }
  }

  if (limit) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'limit must be a positive integer between 1 and 100'
      });
    }
  }

  next();
};

// Assign technician validation
export const validateAssignTechnician = (req, res, next) => {
  const { technician_id } = req.body;

  if (!technician_id) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'technician_id is required'
    });
  }

  next();
};

// Status update validation
export const validateStatusUpdate = (req, res, next) => {
  const { status, notes } = req.body;
  const errors = [];

  if (!status || status.trim().length === 0) errors.push('status is required');

  const validStatuses = [
    'request_received',
    'under_review',
    'assigned',
    'technician_on_the_way',
      'service_in_progress',
      'pending_next_visit',
      'pending_customer_signoff',
    'resolved',
    'closed'
  ];

  if (status && !validStatuses.includes(status)) {
    errors.push(`status must be one of: ${validStatuses.join(', ')}`);
  }

  if (notes && notes.trim().length > 1000) {
    errors.push('notes must not exceed 1000 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Service request validation
export const validateServiceRequest = (req, res, next) => {
  const {
    customer_id,
    location_id,
    room_id,
    room_name,
    customer_org,
    facility_location,
    issue_title,
    issue_description,
    issue_category,
    service_type,
    support_category
  } = req.body;

  const errors = [];
  const isEpabx = String(support_category).toLowerCase() === 'epabx';

  const hasText = (v) => typeof v === 'string' && v.trim().length > 0;

  // The customer portal ties a ticket to a customer/location profile (sends
  // *_id); the admin "Raise Ticket" form stores them as free text (sends
  // *_org / facility_location, no lookup). Accept either — but not neither.
  if (!customer_id && !hasText(customer_org)) errors.push('customer_org is required');
  if (!location_id && !hasText(facility_location)) errors.push('facility_location is required');
  // EPABX tickets have no room; AV tickets need one, by FK or by label.
  if (!isEpabx && !room_id && !hasText(room_name)) errors.push('room is required for AV tickets');
  if (!issue_title || issue_title.trim().length === 0) errors.push('issue_title is required');
  if (!issue_description || issue_description.trim().length === 0) errors.push('issue_description is required');
  if (!issue_category) errors.push('issue_category is required');
  if (!service_type) errors.push('service_type is required');

  if (issue_title && issue_title.trim().length > 255) errors.push('issue_title must not exceed 255 characters');
  if (issue_description && issue_description.trim().length > 2000) errors.push('issue_description must not exceed 2000 characters');
  if (hasText(customer_org) && customer_org.trim().length > 255) errors.push('customer_org must not exceed 255 characters');
  if (hasText(facility_location) && facility_location.trim().length > 255) errors.push('facility_location must not exceed 255 characters');
  if (hasText(room_name) && room_name.trim().length > 255) errors.push('room_name must not exceed 255 characters');

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Customer validation
export const validateCustomer = (req, res, next) => {
  const { name, company_name, email, phone } = req.body;
  const errors = [];

  // `name` (the primary contact / display name) is optional — the create route
  // falls back to contact_person or company_name.
  if (!company_name || company_name.trim().length === 0) errors.push('company_name is required');
  if (!email || email.trim().length === 0) errors.push('email is required');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailRegex.test(email)) errors.push('email must be a valid email address');

  if (name && name.trim().length > 255) errors.push('name must not exceed 255 characters');
  if (company_name && company_name.trim().length > 255) errors.push('company_name must not exceed 255 characters');

  if (phone) {
    const phoneRegex = /^[0-9\+\-\(\)\s]{10,}$/;
    if (!phoneRegex.test(phone)) errors.push('phone must be a valid phone number');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Location validation
export const validateLocation = (req, res, next) => {
  const { name, address, city, postal_code, country } = req.body;
  const errors = [];

  if (!name || name.trim().length === 0) errors.push('name is required');
  if (!address || address.trim().length === 0) errors.push('address is required');
  if (!city || city.trim().length === 0) errors.push('city is required');

  if (name && name.trim().length > 255) errors.push('name must not exceed 255 characters');
  if (address && address.trim().length > 500) errors.push('address must not exceed 500 characters');
  if (city && city.trim().length > 100) errors.push('city must not exceed 100 characters');
  if (postal_code && postal_code.trim().length > 20) errors.push('postal_code must not exceed 20 characters');
  if (country && country.trim().length > 100) errors.push('country must not exceed 100 characters');

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Room validation
export const validateRoom = (req, res, next) => {
  const { name, location_id, room_type, capacity } = req.body;
  const errors = [];

  if (!name || name.trim().length === 0) errors.push('name is required');
  if (!location_id) errors.push('location_id is required');
  if (!room_type || room_type.trim().length === 0) errors.push('room_type is required');
  if (capacity !== undefined && capacity !== null) {
    if (!Number.isInteger(capacity) || capacity < 1) errors.push('capacity must be a positive integer');
  }

  if (name && name.trim().length > 255) errors.push('name must not exceed 255 characters');
  if (room_type && room_type.trim().length > 100) errors.push('room_type must not exceed 100 characters');

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Complete request validation
export const validateCompleteRequest = (req, res, next) => {
  const { customer_signature, rating, feedback_notes } = req.body;
  const errors = [];

  if (!customer_signature) errors.push('customer_signature is required');
  if (rating !== undefined && rating !== null) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      errors.push('rating must be an integer between 1 and 5');
    }
  }

  if (feedback_notes && feedback_notes.trim().length > 1000) {
    errors.push('feedback_notes must not exceed 1000 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Service update validation
export const validateServiceUpdate = (req, res, next) => {
  const { author_name, notes } = req.body;
  const errors = [];

  if (!author_name || author_name.trim().length === 0) errors.push('author_name is required');
  if (!notes || notes.trim().length === 0) errors.push('notes is required');

  if (author_name && author_name.trim().length > 255) errors.push('author_name must not exceed 255 characters');
  if (notes && notes.trim().length > 2000) errors.push('notes must not exceed 2000 characters');

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};
