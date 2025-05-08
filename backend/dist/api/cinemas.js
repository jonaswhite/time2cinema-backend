"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCinemaById = exports.getCinemasByCity = exports.getAllCinemas = void 0;
const db_1 = __importDefault(require("../db"));
// 獲取所有電影院
const getAllCinemas = async (req, res) => {
    try {
        const result = await db_1.default.query('SELECT * FROM cinemas ORDER BY name');
        // 將 latitude 和 longitude 欄位映射為 lat 和 lng
        const mappedRows = result.rows.map(cinema => ({
            ...cinema,
            lat: cinema.latitude, // 添加 lat 欄位
            lng: cinema.longitude, // 添加 lng 欄位
        }));
        res.json(mappedRows);
    }
    catch (error) {
        console.error('獲取電影院數據失敗:', error);
        res.status(500).json({ error: '獲取電影院數據失敗' });
    }
};
exports.getAllCinemas = getAllCinemas;
// 獲取特定城市的電影院
const getCinemasByCity = async (req, res) => {
    try {
        const { city } = req.params;
        if (!city) {
            return res.status(400).json({ error: '請提供城市參數' });
        }
        const result = await db_1.default.query('SELECT * FROM cinemas WHERE city = $1 ORDER BY name', [city]);
        // 將 latitude 和 longitude 欄位映射為 lat 和 lng
        const mappedRows = result.rows.map(cinema => ({
            ...cinema,
            lat: cinema.latitude, // 添加 lat 欄位
            lng: cinema.longitude, // 添加 lng 欄位
        }));
        res.json(mappedRows);
    }
    catch (error) {
        console.error('獲取電影院數據失敗:', error);
        res.status(500).json({ error: '獲取電影院數據失敗' });
    }
};
exports.getCinemasByCity = getCinemasByCity;
// 獲取特定電影院
const getCinemaById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: '請提供電影院ID' });
        }
        const result = await db_1.default.query('SELECT * FROM cinemas WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: '找不到指定的電影院' });
        }
        // 將 latitude 和 longitude 欄位映射為 lat 和 lng
        const cinema = result.rows[0];
        const mappedCinema = {
            ...cinema,
            lat: cinema.latitude, // 添加 lat 欄位
            lng: cinema.longitude, // 添加 lng 欄位
        };
        res.json(mappedCinema);
    }
    catch (error) {
        console.error('獲取電影院數據失敗:', error);
        res.status(500).json({ error: '獲取電影院數據失敗' });
    }
};
exports.getCinemaById = getCinemaById;
