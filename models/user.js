const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new Schema({
    email: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['admin', 'user', 'ngo'],
        required: true,
    },
    image: {
        filename: String,
        url: {
            type: String,
            default: "https://photosnow.net/wp-content/uploads/2024/04/no-dp-mood-off_9.jpg",
        },
    },
    ecotokens: {
        type: Number,
        default: 0,
    },
    warnings: {
        type: Number,
        default: 0,
    },
    isBanned: {
        type: Boolean,
        default: false,
    }
});

userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);