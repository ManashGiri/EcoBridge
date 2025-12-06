const express = require('express');
const app = express();
const ejsMate = require('ejs-mate');
const path = require('path');
const mongoose = require("mongoose");
const cloudinary = require('cloudinary').v2;
const methodOverride = require("method-override");
const NodeGeocoder = require("node-geocoder");
const Upload = require('./models/uploads.js');
const Need = require('./models/needs.js');
const Notification = require('./models/notification.js');
const User = require('./models/user.js');
const flash = require('connect-flash');
const MongoStore = require("connect-mongo");
const passport = require("passport");
const passportLocal = require("passport-local");
const session = require("express-session");
const { saveRedirectUrl, isLoggedIn } = require("./middleware.js");
const multer = require('multer');
const { storage } = require("./cloudConfig.js");
const upload = multer({ storage });

if (process.env.NODE_ENV != "production") {
    require('dotenv').config();
}

const isProduction = process.env.NODE_ENV === "production";
const refererURL = isProduction ? "https://ecobridge-q2m1.onrender.com/home" : "http://localhost:3000/home";

const MONGO_URL = isProduction ? process.env.DB_URL : "mongodb://localhost:27017/echoBridge";

main()
    .then(() => {
        console.log("Connected to DB");
    })
    .catch((err) => {
        console.log(err);
    });

async function main() {
    await mongoose.connect(MONGO_URL);
}

app.set('view engine', 'ejs');
app.engine('ejs', ejsMate);
app.use(methodOverride("_method"));
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

const store = MongoStore.create({
    mongoUrl: MONGO_URL,
    crypto: {
        secret: process.env.SECRET,
    },
    touchAfter: 24 * 60 * 60,
});

const sessionOptions = {
    store,
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    },
}

// app.get("/", (req, res) => {
//     res.send("Hi, I am root");
// });

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new passportLocal(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.curUser = req.user;
    next();
});

app.get('/home', (req, res) => {
    res.render('main/index.ejs');
});

app.get('/contribute', isLoggedIn, (req, res) => {
    res.render('main/contribute.ejs');
});

app.get('/needs', isLoggedIn, (req, res) => {
    res.render('main/needs.ejs');
});


// Create Route - Uploads
app.post('/uploads', isLoggedIn, upload.single('uploads[image]'), async (req, res) => {
    let uploads = req.body.uploads;
    const geocoder = NodeGeocoder({
        provider: 'openstreetmap',
        fetch: async (url, options = {}) => {
            const modifiedOptions = {
                ...options,
                headers: {
                    ...options.headers,
                    'User-Agent': 'EchoBridge/1.0 (503manashsvjc@gmail.com)',
                    'Referer': refererURL,
                }
            };

            return fetch(url, modifiedOptions);
        }

    });
    const response = await geocoder.geocode(uploads.location);
    const geometry = {
        type: "Point",
        coordinates: [
            response[0].longitude,
            response[0].latitude,
        ],
    }
    let url = req.file.path;
    let filename = req.file.filename;
    const newUpload = new Upload(uploads);
    newUpload.owner = req.user._id;
    newUpload.image = { url, filename };
    newUpload.geometry = geometry;
    req.user.ecotokens += 5;
    await req.user.save();
    await newUpload.save();
    req.flash("success", "New Upload Posted!");
    res.redirect("/uploads");
});

// Show Route - Uploads
app.get('/uploads/:id', isLoggedIn, async (req, res) => {
    const uploads = await Upload.findById(req.params.id).populate("owner");
    const needs = await Need.find({ category: uploads.category }).populate("owner");
    res.render('main/show.ejs', { uploads, needs });
});

// Destroy Route - Uploads
app.delete('/uploads/:id', isLoggedIn, async (req, res) => {
    let { id } = req.params;
    const upload = await Upload.findById(id).populate('owner');
    upload.owner.ecotokens -= 5;
    console.log(upload.owner.ecotokens);
    await upload.owner.save();
    if (upload.image && upload.image.filename) {
        await cloudinary.uploader.destroy(upload.image.filename);
    }
    let deletedUpload = await Upload.findByIdAndDelete(id);
    let message = `Warning: Admin deleted your upload :- ${deletedUpload?.category} - ${deletedUpload?.description}`;
    const warnings = upload.owner.warnings + 1;
    upload.owner.warnings = warnings;
    await upload.owner.save();
    const notification = new Notification({
        message,
        recipient: upload.owner._id,
        sender: req.user._id,
    });
    await notification.save();
    req.flash("success", "Upload Deleted!");
    res.redirect("/home");
});

app.get('/uploads', isLoggedIn, async (req, res) => {
    const uploads = await Upload.find({}).populate("owner");
    const allUploads = uploads.filter(upload => {
        return (
            upload.owner && (
                upload.owner._id.equals(req.user._id) || req.user.role === 'ngo' || req.user.role === 'admin'
            )
        );
    });
    res.render('main/uploads.ejs', { allUploads });
});

app.get('/profile', isLoggedIn, async (req, res) => {
    const users = await User.findById(req.user._id);
    const existingNeed = await Need.findOne({ owner: req.user._id });
    const hasNeed = !!existingNeed;
    res.render("main/profile.ejs", { users, existingNeed, hasNeed });
});

// Create Route - Needs
app.post('/needs', isLoggedIn, async (req, res) => {
    let needs = req.body.needs;
    const geocoder = NodeGeocoder({
        provider: 'openstreetmap',
        fetch: async (url, options = {}) => {
            const modifiedOptions = {
                ...options,
                headers: {
                    ...options.headers,
                    'User-Agent': 'EchoBridge/1.0 (503manashsvjc@gmail.com)',
                    'Referer': refererURL,
                }
            };

            return fetch(url, modifiedOptions);
        }

    });
    const response = await geocoder.geocode(needs.location);
    const geometry = {
        type: "Point",
        coordinates: [
            response[0].longitude,
            response[0].latitude,
        ],
    }

    const newNeed = new Need(needs);
    newNeed.owner = req.user._id;
    newNeed.geometry = geometry;
    await newNeed.save();
    req.flash("success", "Requested Item Added!");
    res.redirect("/profile");
});

app.get('/needs/:id/edit', isLoggedIn, async (req, res) => {
    let { id } = req.params;
    const need = await Need.findById(id);
    if (!need) {
        req.flash("error", "News doesn't exists!");
        res.redirect("/profile");
    }
    res.render("main/needEdit.ejs", { need });
});

app.put('/needs/:id', isLoggedIn, async (req, res) => {
    let { id } = req.params;
    let need = await Need.findByIdAndUpdate(id, { ...req.body.needs });
    req.flash("success", "Requested Item Updated!");
    res.redirect(`/profile`);
});

app.post("/profile", upload.single("photo"), async (req, res) => {
    try {
        if (req.user.image.url !== "https://photosnow.net/wp-content/uploads/2024/04/no-dp-mood-off_9.jpg") {
            if (req.user.image && req.user.image.filename) {
                await cloudinary.uploader.destroy(req.user.image.filename);
            }
        }
        const user = await User.findById(req.user._id);
        user.image.url = req.file.path;
        user.image.filename = req.file.filename;
        await user.save();
        req.flash("success", "Profile Picture Updated!");
        res.redirect("/profile");
    } catch (err) {
        console.error("Photo upload failed:", err);
        req.flash("error", "Something went wrong");
        res.redirect("/profile");
    }
});

app.get("/accept/:id", isLoggedIn, async (req, res) => {
    let { id } = req.params;
    const upload = await Upload.findById(id).populate('owner');
    await Upload.findByIdAndUpdate(id, { status: "accepted" });
    const ngo = req.user;
    let message = `${ngo.username} accepted your contribution!`;
    const uploadOwner = await User.findById(upload.owner._id);
    uploadOwner.ecotokens += 10;
    await uploadOwner.save();
    const notification = new Notification({
        message,
        recipient: upload.owner._id,
        sender: ngo._id,
    });
    await notification.save();
    req.flash("success", "Upload Accepted!");
    res.redirect(`/uploads/${id}`);
});

app.get("/notifications", isLoggedIn, async (req, res) => {
    const notifications = await Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 });
    res.render("main/notifications.ejs", { notifications });
});

app.get('/certificate', isLoggedIn, async (req, res) => {
    if (req.user.ecotokens >= 1000) {
        req.flash("success", "Congralutions! You have been certified");
        res.redirect('/profile');
    } else {
        req.flash("error", "Not Enough Ecotokens");
        res.redirect('/profile');
    }
});

app.get('/dashboard', isLoggedIn, async (req, res) => {
    if (req.user.role === 'admin') {
        const users = await User.find({});
        const allUsers = users.filter(user => user.role !== 'admin');
        res.render('main/dashboard.ejs', { allUsers });
    } else {
        req.flash("error", "Access Denied");
        res.redirect('/home');
    }
});

app.get('/signup', (req, res) => {
    res.render('users/signup.ejs');
});

app.post('/signup', saveRedirectUrl, async (req, res) => {
    try {
        let { email, username, role, password, phone } = req.body;
        let newUser = new User({ email, username, phone, role });
        let registeredUser = await User.register(newUser, password);
        req.login(registeredUser, (err) => {
            if (err) {
                return next(err);
            }
            req.flash("success", `Welcome to EchoBridge!`);
            let redirectUrl = res.locals.redirectUrl || "/home";
            res.redirect(redirectUrl);
        });
    } catch (e) {
        req.flash("error", e.message);
        res.redirect("/signup");
    }
});

app.get('/login', (req, res) => {
    res.render('users/login.ejs');
});

app.post('/login', saveRedirectUrl, passport.authenticate("local", { failureRedirect: "/login", failureFlash: true }), async (req, res) => {
    let { username } = req.body;
    req.flash("success", `Hi ${username}, now you're all set to explore!`);
    let redirectUrl = res.locals.redirectUrl || "/home";
    res.redirect(redirectUrl);
});

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        req.flash("success", "Thank you for visiting us. Have a nice day!");
        res.redirect("/home");
    });
});

app.get("/privacy", (req, res) => {
    res.render("conditions/privacy.ejs");
});

app.get("/terms", (req, res) => {
    res.render("conditions/terms.ejs");
});

app.use((err, req, res, next) => {
    let { statusCode = 500, message = "Something went wrong" } = err;
    // res.status(statusCode).send(message);
    res.status(statusCode).render("includes/error.ejs", { err });
});

app.listen(3000, () => {
    console.log("Listening to port 3000");
});