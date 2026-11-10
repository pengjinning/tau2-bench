from pydantic import BaseModel

from tau2.data_model.tasks import Task


class GetTasksRequest(BaseModel):
    """
    Request for getting tasks
    """

    domain: str
    language: str | None = None
    task_split_name: str | None = "base"
    agent: str = "llm_agent"


class GetTasksResponse(BaseModel):
    """
    Response for getting tasks
    """

    tasks: list[Task]
