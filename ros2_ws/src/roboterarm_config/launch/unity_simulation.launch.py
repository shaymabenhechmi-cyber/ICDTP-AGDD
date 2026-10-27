import os
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, TimerAction, DeclareLaunchArgument
from launch.launch_description_sources import PythonLaunchDescriptionSource, AnyLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch.conditions import IfCondition, UnlessCondition
from launch_ros.actions import Node
from launch.substitutions import Command
from ament_index_python.packages import get_package_share_directory

def generate_launch_description():
    rosbridge_dir = get_package_share_directory('rosbridge_server')
    roboterarm_config_dir = get_package_share_directory('roboterarm_config')

    calibration_file = os.path.join(
        roboterarm_config_dir, 'config', 'stm32_calibration.yaml'
    )

    use_sim_arg = DeclareLaunchArgument(
        'use_sim', default_value='false',
        description='If true, run fake_stm32_node.py instead of the real serial bridge (no robot/USB needed)'
    )
    use_sim = LaunchConfiguration('use_sim')

    # 1. rosbridge WebSocket Server (interface to Unity)
    rosbridge_launch = IncludeLaunchDescription(
        AnyLaunchDescriptionSource(
            os.path.join(rosbridge_dir, 'launch', 'rosbridge_websocket_launch.xml')
        ),
        launch_arguments={'port': '9090'}.items()
    )

    # 2. Robot State Publisher (URDF -> /robot_description, /tf)
    rsp_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(roboterarm_config_dir, 'launch', 'rsp.launch.py')
        )
    )

    # 3. Statische TF: world -> base_link
    static_tf_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(roboterarm_config_dir, 'launch',
                         'static_virtual_joint_tfs.launch.py')
        )
    )

    # 4. ros2_control controller manager (simulation)
    controllers_file = os.path.join(
        roboterarm_config_dir, 'config', 'ros2_controllers.yaml'
    )

    robot_description_file = os.path.join(
        roboterarm_config_dir, 'config', 'Roboterarm_mit_Objs.urdf.xacro'
    )

    ros2_control_node = Node(
        package='controller_manager',
        executable='ros2_control_node',
        parameters=[
            {
                'robot_description': Command([
                    'xacro ',
                    robot_description_file
                ])
            },
            controllers_file
        ],
        output='screen'
    )

    # 5. MoveIt move_group (planning, IK, OMPL)
    move_group_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(roboterarm_config_dir, 'launch', 'move_group.launch.py')
        )
    )

    # 6. Unity <-> MoveIt Bridge
    unity_bridge_node = Node(
        package='roboterarm_config',
        executable='unity_moveit_bridge.py',
        output='screen'
    )

    # 6a. STM32 Serial Bridge — real hardware over USB (used when use_sim:=false)
    stm32_serial_node = Node(
        package='roboterarm_config',
        executable='stm32_serial_node.py',
        output='screen',
        condition=UnlessCondition(use_sim),
        parameters=[
            calibration_file,
            {'serial_port': '/dev/ttyACM0'},
            {'baud_rate': 115200},
        ]
    )

    # 6b. Fake STM32 Bridge — pure simulation, no serial port (used when use_sim:=true)
    fake_stm32_node = Node(
        package='roboterarm_config',
        executable='fake_stm32_node.py',
        output='screen',
        condition=IfCondition(use_sim),
    )

    return LaunchDescription([
        use_sim_arg,
        rosbridge_launch,
        rsp_launch,
        static_tf_launch,
        ros2_control_node,
        move_group_launch,
        # Wait until MoveIt is fully started
        TimerAction(period=12.0, actions=[
            unity_bridge_node,
            stm32_serial_node,
            fake_stm32_node,
        ])
    ])
