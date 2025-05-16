"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nowShowingMoviesRouter = void 0;
const express_1 = __importDefault(require("express"));
const nowShowingMovies_1 = require("./nowShowingMovies");
const router = express_1.default.Router();
// 獲取所有正在上映的電影
router.get('/', (req, res) => {
    (0, nowShowingMovies_1.getNowShowingMovies)(req, res);
});
exports.nowShowingMoviesRouter = router;
