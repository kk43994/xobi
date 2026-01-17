"""统计数据控制器 - 提供仪表盘用量统计"""
from flask import Blueprint, jsonify
from models import db, Project, Asset, Job, Material, Page

stats_bp = Blueprint('stats', __name__, url_prefix='/api/stats')


@stats_bp.route('', methods=['GET'])
def get_stats():
    """获取系统统计数据"""
    try:
        # 项目总数
        projects_count = db.session.query(Project).count()

        # 已完成的任务数
        jobs_completed = db.session.query(Job).filter(Job.status == 'completed').count()

        # 总任务数
        jobs_total = db.session.query(Job).count()

        # 资源/素材总数（生成的图片数量）
        assets_count = db.session.query(Asset).count()
        materials_count = db.session.query(Material).count()
        images_generated = assets_count + materials_count

        # 页面总数（可以代表生成的详情页数量）
        pages_count = db.session.query(Page).count()

        # 有图片的页面数
        pages_with_images = db.session.query(Page).filter(
            Page.image_url.isnot(None),
            Page.image_url != ''
        ).count()

        return jsonify({
            'success': True,
            'data': {
                'projects_count': projects_count,
                'jobs_completed': jobs_completed,
                'jobs_total': jobs_total,
                'images_generated': images_generated,
                'assets_count': assets_count,
                'materials_count': materials_count,
                'pages_count': pages_count,
                'pages_with_images': pages_with_images,
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': {'message': str(e)}
        }), 500
