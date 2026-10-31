import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Rating Matrix Model
const ratingMatrixSchema = new Schema({
    rating_number: {
        type: Number,
        required: true,
        min: 1,
        max: 10
    },
    matrix_name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        enum: ["managerial_staff", "non_managerial_staff", "peer"],
        index: true
    },
    is_active: {
        type: Boolean,
        default: true
    },
    created_by: {
        type: String,
        default: "Admin"
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_by: {
        type: String
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});

// Compound index to ensure unique rating numbers per category
ratingMatrixSchema.index({ category: 1, rating_number: 1 }, { unique: true });
ratingMatrixSchema.index({ matrix_name: 'text', description: 'text' }); // Text search

// Pre-save middleware to update timestamp
ratingMatrixSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.updated_at = new Date();
    }
    next();
});

const RatingMatrix = mongoose.model('RatingMatrix', ratingMatrixSchema);
export default RatingMatrix;