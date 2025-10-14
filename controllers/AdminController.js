const User = require('../models/User');
const Prize = require('../models/Prize');
const db = require('../config/database');
const crypto = require('crypto');

class AdminController {
    constructor() {
        // Admin credentials
        this.adminUsername = process.env.ADMIN_USERNAME;
        this.adminPasswordHash = this.hashPassword(process.env.ADMIN_PASSWORD);
    }

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    async login(req, res) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'نام کاربری و رمز عبور الزامی است'
                });
            }

            const passwordHash = this.hashPassword(password);

            if (username === this.adminUsername && passwordHash === this.adminPasswordHash) {
                // Set admin session
                req.session.isAdmin = true;
                req.session.adminUsername = username;

                res.json({
                    success: true,
                    message: 'ورود موفقیت‌آمیز'
                });
            } else {
                res.status(401).json({
                    success: false,
                    message: 'نام کاربری یا رمز عبور اشتباه است'
                });
            }
        } catch (error) {
            console.error('Admin login error:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در ورود'
            });
        }
    }

    async logout(req, res) {
        try {
            req.session.destroy((err) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: 'خطا در خروج'
                    });
                }
                res.json({
                    success: true,
                    message: 'خروج با موفقیت انجام شد'
                });
            });
        } catch (error) {
            console.error('Admin logout error:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در خروج'
            });
        }
    }

    async getUsers(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const search = req.query.search || '';
            const filter = req.query.filter || 'all';
            const offset = (page - 1) * limit;

            let whereClause = '';
            let whereParams = [];

            // Search filter
            if (search) {
                whereClause = 'WHERE (u.phone LIKE ? OR u.prize LIKE ?)';
                whereParams = [`%${search}%`, `%${search}%`];
            }

            // Status filter
            if (filter === 'played') {
                whereClause = whereClause ?
                    whereClause + ' AND u.has_played = 1' :
                    'WHERE u.has_played = 1';
            } else if (filter === 'not_played') {
                whereClause = whereClause ?
                    whereClause + ' AND u.has_played = 0' :
                    'WHERE u.has_played = 0';
            } else if (filter === 'verified') {
                whereClause = whereClause ?
                    whereClause + ' AND u.is_verified = 1' :
                    'WHERE u.is_verified = 1';
            }

            // Get total count
            const countQuery = `SELECT COUNT(*) as total FROM users u ${whereClause}`;
            const countResult = await db.queryRaw(countQuery, whereParams);
            const totalCount = countResult[0]?.total || 0;

            // Get users with pagination - با اضافه کردن فیلدهای UTM
            let users = [];
            if (totalCount > 0) {
                const query = `
                    SELECT
                        u.id,
                        u.phone,
                        u.is_verified,
                        u.has_played,
                        u.prize,
                        u.prize_id,
                        u.created_at,
                        u.played_at,
                        u.utm_source,
                        u.utm_medium,
                        u.utm_campaign,
                        p.name as prize_name,
                        p.code as prize_code,
                        p.is_empty as prize_is_empty
                    FROM users u
                             LEFT JOIN prizes p ON u.prize_id = p.id
                        ${whereClause}
                    ORDER BY u.created_at DESC
                        LIMIT ${limit} OFFSET ${offset}
                `;

                // Use queryRaw for dynamic SQL with LIMIT and OFFSET
                users = await db.queryRaw(query, whereParams);
            }

            res.json({
                success: true,
                data: {
                    users: users || [],
                    pagination: {
                        total: totalCount,
                        page: page,
                        limit: limit,
                        pages: Math.ceil(totalCount / limit) || 1
                    }
                }
            });

        } catch (error) {
            console.error('Error getting users:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در دریافت اطلاعات کاربران',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async getStats(req, res) {
        try {
            // General statistics
            const statsQuery = `
                SELECT
                    COUNT(*) as total_users,
                    SUM(CASE WHEN has_played = 1 THEN 1 ELSE 0 END) as played_count,
                    SUM(CASE WHEN has_played = 0 THEN 1 ELSE 0 END) as not_played_count,
                    SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as verified_count,
                    SUM(CASE WHEN is_verified = 0 THEN 1 ELSE 0 END) as not_verified_count
                FROM users
            `;

            const stats = await db.query(statsQuery);

            // Today's statistics
            const todayQuery = `
                SELECT
                    COUNT(*) as today_users,
                    SUM(CASE WHEN has_played = 1 THEN 1 ELSE 0 END) as today_played
                FROM users
                WHERE DATE(created_at) = CURDATE()
            `;

            const todayStats = await db.query(todayQuery);

            // This week's statistics
            const weekQuery = `
                SELECT
                    COUNT(*) as week_users,
                    SUM(CASE WHEN has_played = 1 THEN 1 ELSE 0 END) as week_played
                FROM users
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            `;

            const weekStats = await db.query(weekQuery);

            // This month's statistics
            const monthQuery = `
                SELECT
                    COUNT(*) as month_users,
                    SUM(CASE WHEN has_played = 1 THEN 1 ELSE 0 END) as month_played
                FROM users
                WHERE MONTH(created_at) = MONTH(CURDATE())
                  AND YEAR(created_at) = YEAR(CURDATE())
            `;

            const monthStats = await db.query(monthQuery);

            res.json({
                success: true,
                data: {
                    total: stats[0],
                    today: todayStats[0],
                    week: weekStats[0],
                    month: monthStats[0]
                }
            });

        } catch (error) {
            console.error('Error getting stats:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در دریافت آمار'
            });
        }
    }

    async getDailyStats(req, res) {
        try {
            const { days = 30 } = req.query;

            const query = `
                SELECT
                    DATE(created_at) as date,
                    COUNT(*) as total_users,
                    SUM(CASE WHEN has_played = 1 THEN 1 ELSE 0 END) as played_users
                FROM users
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `;

            const dailyStats = await db.query(query, [parseInt(days)]);

            res.json({
                success: true,
                data: dailyStats
            });

        } catch (error) {
            console.error('Error getting daily stats:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در دریافت آمار روزانه'
            });
        }
    }

    async getPrizeStats(req, res) {
        try {
            const query = `
                SELECT
                    p.id,
                    p.name,
                    p.english_name,
                    p.is_empty,
                    p.probability,
                    p.is_active,
                    p.display_order,
                    p.image,
                    p.link,
                    p.code,
                    p.button_text,
                    p.prize_text,
                    COUNT(u.id) as win_count,
                    ROUND(
                            CASE
                                WHEN (SELECT COUNT(*) FROM users WHERE has_played = 1) > 0
                                    THEN COUNT(u.id) * 100.0 / (SELECT COUNT(*) FROM users WHERE has_played = 1)
                                ELSE 0
                                END, 2
                    ) as win_percentage
                FROM prizes p
                         LEFT JOIN users u ON p.id = u.prize_id
                GROUP BY p.id, p.name, p.english_name, p.is_empty, p.probability, p.is_active, 
                         p.display_order, p.image, p.link, p.code, p.button_text, p.prize_text
                ORDER BY p.display_order ASC
            `;

            const prizeStats = await db.query(query);

            res.json({
                success: true,
                data: prizeStats
            });

        } catch (error) {
            console.error('Error getting prize stats:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در دریافت آمار جوایز'
            });
        }
    }

    async getAllPrizes(req, res) {
        try {
            const prizes = await Prize.getAll(false); // Get all prizes including inactive
            res.json({
                success: true,
                data: prizes.map(p => p.toJSON())
            });
        } catch (error) {
            console.error('Error getting prizes:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در دریافت جوایز'
            });
        }
    }

    async createPrize(req, res) {
        try {
            const prizeData = req.body;

            // Validate probability
            if (prizeData.probability < 0 || prizeData.probability > 1) {
                return res.status(400).json({
                    success: false,
                    message: 'احتمال باید بین 0 و 1 باشد'
                });
            }

            const prize = new Prize(prizeData);
            await prize.save();

            res.json({
                success: true,
                message: 'جایزه با موفقیت ایجاد شد',
                data: prize.toJSON()
            });

        } catch (error) {
            console.error('Error creating prize:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در ایجاد جایزه'
            });
        }
    }

    async updatePrize(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            console.log('Updating prize:', id, updateData);

            // Validate probability if provided
            if (updateData.probability !== undefined) {
                if (updateData.probability < 0 || updateData.probability > 1) {
                    return res.status(400).json({
                        success: false,
                        message: 'احتمال باید بین 0 و 1 باشد'
                    });
                }
            }

            const prize = await Prize.getById(id);
            if (!prize) {
                return res.status(404).json({
                    success: false,
                    message: 'جایزه یافت نشد'
                });
            }

            // Update prize fields - تمام فیلدها رو آپدیت کن
            if (updateData.name !== undefined) prize.name = updateData.name;
            if (updateData.english_name !== undefined) prize.englishName = updateData.english_name;
            if (updateData.probability !== undefined) prize.probability = updateData.probability;
            if (updateData.display_order !== undefined) prize.displayOrder = updateData.display_order;
            if (updateData.link !== undefined) prize.link = updateData.link;
            if (updateData.image !== undefined) prize.image = updateData.image;
            if (updateData.button_text !== undefined) prize.buttonText = updateData.button_text;
            if (updateData.prize_text !== undefined) prize.prizeText = updateData.prize_text;
            if (updateData.code !== undefined) prize.code = updateData.code;
            if (updateData.is_empty !== undefined) prize.isEmpty = updateData.is_empty;
            if (updateData.is_active !== undefined) prize.isActive = updateData.is_active;

            await prize.save();

            res.json({
                success: true,
                message: 'جایزه با موفقیت بروزرسانی شد',
                data: prize.toJSON()
            });

        } catch (error) {
            console.error('Error updating prize:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در بروزرسانی جایزه',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async deletePrize(req, res) {
        try {
            const { id } = req.params;

            // Check if any user has won this prize
            const checkQuery = 'SELECT COUNT(*) as count FROM users WHERE prize_id = ?';
            const checkResult = await db.query(checkQuery, [id]);

            if (checkResult[0].count > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'این جایزه توسط کاربران برنده شده و قابل حذف نیست. می‌توانید آن را غیرفعال کنید.'
                });
            }

            // Delete the prize
            const deleteQuery = 'DELETE FROM prizes WHERE id = ?';
            await db.query(deleteQuery, [id]);

            res.json({
                success: true,
                message: 'جایزه با موفقیت حذف شد'
            });

        } catch (error) {
            console.error('Error deleting prize:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در حذف جایزه'
            });
        }
    }

    async normalizeProbabilities(req, res) {
        try {
            // Get all active prizes
            const query = 'SELECT id, probability FROM prizes WHERE is_active = 1';
            const prizes = await db.query(query);

            if (prizes.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'هیچ جایزه فعالی یافت نشد'
                });
            }

            // Calculate total probability
            const total = prizes.reduce((sum, prize) => sum + parseFloat(prize.probability), 0);

            if (Math.abs(total - 1.0) < 0.001) {
                return res.json({
                    success: true,
                    message: 'احتمالات در حال حاضر نرمال هستند'
                });
            }

            // Normalize probabilities
            for (const prize of prizes) {
                const normalizedProbability = parseFloat(prize.probability) / total;
                await db.query(
                    'UPDATE prizes SET probability = ? WHERE id = ?',
                    [normalizedProbability, prize.id]
                );
            }

            res.json({
                success: true,
                message: 'احتمالات با موفقیت نرمال‌سازی شدند'
            });

        } catch (error) {
            console.error('Error normalizing probabilities:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در نرمال‌سازی احتمالات'
            });
        }
    }

    async exportData(req, res) {
        try {
            const { format = 'csv', filter = 'all' } = req.body;

            let whereClause = '';
            if (filter === 'played') {
                whereClause = 'WHERE u.has_played = 1';
            } else if (filter === 'winners') {
                whereClause = 'WHERE u.has_played = 1 AND p.is_empty = 0';
            }

            const query = `
                SELECT
                    u.phone as 'شماره_تماس',
                    CASE WHEN u.is_verified = 1 THEN 'بله' ELSE 'خیر' END as 'تایید_شده',
                    CASE WHEN u.has_played = 1 THEN 'بله' ELSE 'خیر' END as 'شرکت_کرده',
                    IFNULL(p.name, u.prize) as 'جایزه',
                    IFNULL(p.code, '') as 'کد_جایزه',
                    IFNULL(u.utm_source, '') as 'منبع_ورود',
                    IFNULL(u.utm_medium, '') as 'مدیوم',
                    IFNULL(u.utm_campaign, '') as 'کمپین',
                    u.created_at as 'تاریخ_ثبت‌نام',
                    u.played_at as 'تاریخ_بازی'
                FROM users u
                         LEFT JOIN prizes p ON u.prize_id = p.id
                    ${whereClause}
                ORDER BY u.created_at DESC
            `;

            const data = await db.query(query);

            if (format === 'csv') {
                // Create CSV
                const headers = Object.keys(data[0] || {}).join(',');
                const rows = data.map(row => Object.values(row).join(',')).join('\n');
                const csv = headers + '\n' + rows;

                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"');
                res.send('\ufeff' + csv); // UTF-8 BOM
            } else {
                res.json({
                    success: true,
                    data: data
                });
            }

        } catch (error) {
            console.error('Error exporting data:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در خروجی گرفتن از داده‌ها'
            });
        }
    }
}

module.exports = new AdminController();